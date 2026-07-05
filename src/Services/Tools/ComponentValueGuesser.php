<?php

declare(strict_types=1);

/*
 * This file is part of Part-DB (https://github.com/Part-DB/Part-DB-server).
 *
 *  Copyright (C) 2019 - 2024 Jan Böhmer (https://github.com/jbtronics)
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

namespace App\Services\Tools;

use App\Entity\Parts\Part;

/**
 * Best-effort classification of a part as a resistor / SMD resistor / capacitor, together with its
 * electrical value, from its parameters, footprint, category and name. Used by the value calculator
 * (to pre-fill) and the bulk image generator (to classify a whole assortment).
 */
class ComponentValueGuesser
{
    /** Imperial SMD chip package codes that mark a part as surface-mount. */
    private const SMD_PACKAGES = ['01005', '0201', '0402', '0603', '0805', '1206', '1210', '2010', '2512'];

    /** Imperial -> metric size, for building KiCad SMD footprint names. */
    private const SMD_METRIC = [
        '0201' => '0603', '0402' => '1005', '0603' => '1608', '0805' => '2012',
        '1206' => '3216', '1210' => '3225', '2010' => '5025', '2512' => '6332',
    ];

    /**
     * Suggested KiCad/EDA settings for a classified component. Uses the detected package for SMD
     * parts and the lead pitch / body diameter for through-hole ceramic discs.
     *
     * @param array{type: string, package: string|null, pitch: float|null, diameter: float|null} $guess
     *
     * @return array{symbol: string, reference: string, footprint: string|null}
     */
    public function edaSuggestion(array $guess): array
    {
        $type = $guess['type'];
        $package = $guess['package'] ?? null;

        if ($type === 'capacitor') {
            return [
                'symbol' => 'Device:C',
                'reference' => 'C',
                'footprint' => $this->capDiscFootprint($guess['pitch'] ?? null, $guess['diameter'] ?? null),
            ];
        }

        if ($type === 'inductor') {
            return ['symbol' => 'Device:L', 'reference' => 'L', 'footprint' => null];
        }

        if ($type === 'smd_resistor' && $package !== null && isset(self::SMD_METRIC[$package])) {
            $footprint = 'Resistor_SMD:R_'.$package.'_'.self::SMD_METRIC[$package].'Metric';
        } else {
            //Through-hole resistor: default to the common 1/4 W axial footprint (editable afterwards).
            $footprint = 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal';
        }

        return ['symbol' => 'Device:R', 'reference' => 'R', 'footprint' => $footprint];
    }

    /**
     * Picks a standard KiCad through-hole ceramic disc footprint for the given lead pitch (mm) and
     * body diameter (mm), choosing the pitch bucket (2.50 / 5.00 / 7.50 mm) then the nearest disc
     * diameter within it. Defaults to a 5 mm pitch / 5 mm disc.
     */
    private function capDiscFootprint(?float $pitch, ?float $diameter): string
    {
        $p = $pitch ?? 5.0;
        $d = $diameter ?? 5.0;

        if ($p < 3.8) {
            $options = [
                [3.0, 'Capacitor_THT:C_Disc_D3.0mm_W1.6mm_P2.50mm'],
                [3.8, 'Capacitor_THT:C_Disc_D3.8mm_W2.6mm_P2.50mm'],
                [5.0, 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P2.50mm'],
            ];
        } elseif ($p < 6.5) {
            $options = [
                [5.0, 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm'],
                [6.0, 'Capacitor_THT:C_Disc_D6.0mm_W2.5mm_P5.00mm'],
                [7.5, 'Capacitor_THT:C_Disc_D7.5mm_W2.5mm_P5.00mm'],
                [10.0, 'Capacitor_THT:C_Disc_D10.0mm_W2.5mm_P5.00mm'],
            ];
        } else {
            $options = [
                [7.5, 'Capacitor_THT:C_Disc_D7.5mm_W5.0mm_P7.50mm'],
                [10.5, 'Capacitor_THT:C_Disc_D10.5mm_W5.0mm_P7.50mm'],
            ];
        }

        $best = $options[0][1];
        $bestDelta = INF;
        foreach ($options as [$dia, $fp]) {
            $delta = abs($dia - $d);
            if ($delta < $bestDelta) {
                $bestDelta = $delta;
                $best = $fp;
            }
        }

        return $best;
    }

    /**
     * Classifies a part.
     *
     * @return array{type: 'resistor'|'smd_resistor'|'capacitor'|'inductor', value: float, package: string|null,
     *               voltage: int|null, tolerance: string|null, pitch: float|null, diameter: float|null,
     *               power: float|null, ppm: int|null, color: string|null}|null
     *              value is ohms (resistors), farads (capacitors) or henries (inductors); null if it
     *              can't be classified.
     */
    public function guess(Part $part): ?array
    {
        [$ohms, $farads, $henries] = $this->extractValue($part);
        $tolerance = $this->detectTolerance($part);
        $color = $this->detectBodyColor($part);

        if ($ohms !== null && $ohms > 0) {
            $package = $this->detectSmdPackage($part);

            return [
                'type' => $package !== null ? 'smd_resistor' : 'resistor',
                'value' => $ohms,
                'package' => $package,
                'voltage' => null,
                'tolerance' => $tolerance,
                'pitch' => null,
                'diameter' => null,
                'power' => $this->detectPower($part),
                'ppm' => $this->detectPpm($part),
                'color' => $color,
            ];
        }

        if ($farads !== null && $farads > 0) {
            return [
                'type' => 'capacitor',
                'value' => $farads,
                'package' => null,
                'voltage' => $this->detectVoltage($part),
                'tolerance' => $tolerance,
                'pitch' => $this->detectPitch($part),
                'diameter' => $this->detectDiameter($part),
                'power' => null,
                'ppm' => null,
                'color' => $color,
            ];
        }

        if ($henries !== null && $henries > 0) {
            return [
                'type' => 'inductor',
                'value' => $henries,
                'package' => null,
                'voltage' => null,
                'tolerance' => $tolerance,
                'pitch' => null,
                'diameter' => null,
                'power' => null,
                'ppm' => null,
                'color' => $color,
            ];
        }

        return null;
    }

    /** Temperature coefficient in ppm/K (e.g. "50ppm", "±25 ppm/°C") from the name/description, else null. */
    private function detectPpm(Part $part): ?int
    {
        $text = $part->getName().' '.$part->getDescription();
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*ppm/iu', $text, $m) === 1) {
            return (int) round((float) str_replace(',', '.', $m[1]));
        }

        return null;
    }

    /** Rated power in watts (e.g. "0.25 W", "1/4 W", "1W") from the name/description, else null. */
    private function detectPower(Part $part): ?float
    {
        $text = $part->getName().' '.$part->getDescription();
        //Fractional watt, e.g. "1/4 W", "1/2W".
        if (preg_match('#(\d+)\s*/\s*(\d+)\s*W(?![a-zA-Z0-9])#u', $text, $m) === 1 && (int) $m[2] !== 0) {
            return (float) $m[1] / (float) $m[2];
        }
        //Decimal watt, e.g. "0.25 W", "1 W", "0.5W".
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*W(?![a-zA-Z0-9])/u', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]);
        }

        return null;
    }

    /** Detects a body colour word (e.g. "blue body") in the name/description; returns a hex colour or null. */
    private function detectBodyColor(Part $part): ?string
    {
        $text = mb_strtolower($part->getName().' '.$part->getDescription());
        //Ordered so more specific words win; each maps to the swatch used by the drawing.
        $colors = [
            'beige' => '#e8d9b5', 'tan' => '#e8d9b5', 'cream' => '#e8d9b5',
            'blue' => '#2f6db0', 'green' => '#2e7d4f', 'red' => '#b34a2f',
            'brown' => '#6b4a2f', 'black' => '#20242a', 'grey' => '#8a9099',
            'gray' => '#8a9099', 'purple' => '#7b4fb0', 'violet' => '#7b4fb0',
            'amber' => '#e0a63a', 'yellow' => '#e0a63a', 'white' => '#e8e8e8',
        ];
        foreach ($colors as $word => $hex) {
            if (preg_match('/\b'.$word.'\b/u', $text) === 1) {
                return $hex;
            }
        }

        return null;
    }

    /** Lead pitch in mm, from a Pitch/RM parameter or the name ("pitch 2.54mm", "RM5"), else null. */
    private function detectPitch(Part $part): ?float
    {
        try {
            foreach ($part->getParameters() as $param) {
                if (preg_match('/pitch|lead spacing|raster|\brm\b|pin distance/u', mb_strtolower($param->getName())) === 1
                    && $param->getValueTypical() !== null && $param->getValueTypical() > 0) {
                    return (float) $param->getValueTypical();
                }
            }
        } catch (\Throwable) {
            //fall through to text parsing
        }

        $text = $part->getName().' '.$part->getDescription();
        if (preg_match('/(?:pitch|rm|raster)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*mm?/iu', $text, $m) === 1
            || preg_match('/(\d+(?:[.,]\d+)?)\s*mm\s*pitch/iu', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]);
        }

        return null;
    }

    /** Body diameter in mm, from a Diameter/Size parameter or the name ("⌀5mm"), else null. */
    private function detectDiameter(Part $part): ?float
    {
        try {
            foreach ($part->getParameters() as $param) {
                if (preg_match('/diameter|durchmesser|body size/u', mb_strtolower($param->getName())) === 1
                    && $param->getValueTypical() !== null && $param->getValueTypical() > 0) {
                    return (float) $param->getValueTypical();
                }
            }
        } catch (\Throwable) {
            //fall through to text parsing
        }

        $text = $part->getName().' '.$part->getDescription();
        if (preg_match('/[⌀Ø]\s*(\d+(?:[.,]\d+)?)/u', $text, $m) === 1
            || preg_match('/(?:diameter|durchmesser)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*mm?/iu', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]);
        }

        return null;
    }

    /** Rated voltage in volts, from a Voltage parameter or the name/description ("50V"), else null. */
    private function detectVoltage(Part $part): ?int
    {
        try {
            foreach ($part->getParameters() as $param) {
                if (preg_match('/voltage|spannung|\bvdc\b/u', mb_strtolower($param->getName())) === 1
                    && $param->getValueTypical() !== null && $param->getValueTypical() > 0) {
                    return (int) round($param->getValueTypical());
                }
            }
        } catch (\Throwable) {
            //fall through to text parsing
        }

        if (preg_match('/(\d+(?:[.,]\d+)?)\s*V(?:DC|AC)?\b/iu', $part->getName().' '.$part->getDescription(), $m) === 1) {
            return (int) round((float) str_replace(',', '.', $m[1]));
        }

        return null;
    }

    /** Tolerance as a display string (e.g. "±10%") from a Tolerance parameter or the name, else null. */
    private function detectTolerance(Part $part): ?string
    {
        try {
            foreach ($part->getParameters() as $param) {
                if (preg_match('/toleran/u', mb_strtolower($param->getName())) !== 1) {
                    continue;
                }
                $text = trim($param->getValueText() ?? '');
                if ($text !== '') {
                    return $text;
                }
                if ($param->getValueTypical() !== null) {
                    return '±'.rtrim(rtrim(sprintf('%.2f', $param->getValueTypical()), '0'), '.').'%';
                }
            }
        } catch (\Throwable) {
            //fall through to text parsing
        }

        $text = $part->getName().' '.$part->getDescription();
        if (preg_match('/±\s*(\d+(?:[.,]\d+)?)\s*%/u', $text, $m) === 1
            || preg_match('/\b(\d+(?:[.,]\d+)?)\s*%/u', $text, $m) === 1) {
            return '±'.str_replace(',', '.', $m[1]).'%';
        }

        return null;
    }

    /**
     * Extracts the resistance (ohms), capacitance (farads) and/or inductance (henries) of a part:
     * first from its parameters, then (for parts named by their value, e.g. "10nF") from the name.
     *
     * @return array{0: float|null, 1: float|null, 2: float|null} [ohms, farads, henries]
     */
    public function extractValue(Part $part): array
    {
        try {
            [$ohms, $farads, $henries] = $this->fromParameters($part);
            if ($ohms !== null || $farads !== null || $henries !== null) {
                return [$ohms, $farads, $henries];
            }

            $text = trim($part->getName().' '.$part->getDescription());

            //Farad and henry units are unambiguous, so a match in the name wins over resistance.
            $farads = $this->parseFaradsFromText($text);
            if ($farads !== null) {
                return [null, $farads, null];
            }
            $henries = $this->parseHenriesFromText($text);
            if ($henries !== null) {
                return [null, null, $henries];
            }

            return [$this->parseOhmsFromText($text), null, null];
        } catch (\Throwable) {
            return [null, null, null];
        }
    }

    /**
     * Reads the resistance/capacitance/inductance from the part's parameters. The number lives in
     * value_typical; its SI prefix is baked into the unit string (e.g. 4.7 + "kΩ" -> 4700 Ω).
     *
     * @return array{0: float|null, 1: float|null, 2: float|null} [ohms, farads, henries]
     */
    private function fromParameters(Part $part): array
    {
        $ohms = null;
        $farads = null;
        $henries = null;

        foreach ($part->getParameters() as $param) {
            $name = mb_strtolower($param->getName());
            $unit = trim($param->getUnit() ?? '');

            $isRes = preg_match('/resist|widerstand|ohm/u', $name) === 1
                || str_contains($unit, 'Ω') || stripos($unit, 'ohm') !== false;
            $isCap = preg_match('/capacit|kapazit|farad/u', $name) === 1
                || preg_match('/^(meg|[pnuµmkMg])?F$/u', $unit) === 1;
            $isInd = preg_match('/induct|induktivit/u', $name) === 1
                || preg_match('/^(meg|[pnuµmk])?H$/u', $unit) === 1;

            if (!$isRes && !$isCap && !$isInd) {
                continue;
            }

            $num = $param->getValueTypical();
            if ($num === null || $num <= 0) {
                continue;
            }

            $prefix = (string) preg_replace('/(Ω|ohms?|F|farads?|H|henr(y|ies))$/iu', '', $unit);
            $value = $num * $this->prefixFactor($prefix);

            if ($isRes && $ohms === null) {
                $ohms = $value;
            } elseif ($isCap && $farads === null) {
                $farads = $value;
            } elseif ($isInd && $henries === null) {
                $henries = $value;
            }
        }

        return [$ohms, $farads, $henries];
    }

    /** Parses a capacitance (farads) out of free text like "10nF", "0.1uF" or "4n7", else null. */
    private function parseFaradsFromText(string $text): ?float
    {
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(p|n|u|µ|m)?F\b/iu', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]) * $this->prefixFactor(mb_strtolower($m[2] ?? ''));
        }
        //RKM notation, e.g. 4n7 = 4.7 nF, 2p2 = 2.2 pF.
        if (preg_match('/\b(\d+)(p|n|u|µ)(\d+)\b/iu', $text, $m) === 1) {
            return (float) ($m[1].'.'.$m[3]) * $this->prefixFactor(mb_strtolower($m[2]));
        }

        return null;
    }

    /** Parses an inductance (henries) out of free text like "100µH", "10mH", "4.7uH" or "1H", else null. */
    private function parseHenriesFromText(string $text): ?float
    {
        //Uppercase H only (so "MHz" and "100h" hours don't match); the (?![a-zA-Z0-9]) avoids "MHz".
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(p|n|u|µ|m)?H(?![a-zA-Z0-9])/u', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]) * $this->prefixFactor(mb_strtolower($m[2] ?? ''));
        }

        return null;
    }

    /** Parses a resistance (ohms) out of free text like "4k7", "10k", "470R" or "4.7kΩ", else null. */
    private function parseOhmsFromText(string $text): ?float
    {
        //RKM notation, e.g. 4k7 = 4.7 kΩ, 1R5 = 1.5 Ω, 2M2 = 2.2 MΩ.
        //NB: we use (?<![a-zA-Z0-9]) / (?![a-zA-Z0-9]) instead of \b, because PCRE treats the "Ω"
        //that usually follows (e.g. "4k7Ω") as a word character under /u, so \b would fail there.
        if (preg_match('/(?<![a-zA-Z0-9])(\d+)(R|k|K|M|G)(\d+)(?![a-zA-Z0-9])/u', $text, $m) === 1) {
            $factor = strtoupper($m[2]) === 'R' ? 1.0 : $this->ohmPrefixFactor($m[2]);

            return (float) ($m[1].'.'.$m[3]) * $factor;
        }
        //Number followed by a magnitude letter, e.g. 10k, 4.7M, 470R, or "10 kΩ" / "1 MΩ" with a unit.
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(k|K|M|G|R)(?![a-zA-Z0-9])/u', $text, $m) === 1) {
            if (strtoupper($m[2]) === 'R') {
                return (float) str_replace(',', '.', $m[1]);
            }

            return (float) str_replace(',', '.', $m[1]) * $this->ohmPrefixFactor($m[2]);
        }
        //Explicit ohm unit, e.g. 470Ω, 1 ohm.
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(?:Ω|ohms?)/iu', $text, $m) === 1) {
            return (float) str_replace(',', '.', $m[1]);
        }

        return null;
    }

    /** kilo/mega/giga factor for a resistance magnitude letter ("M" means mega in this context). */
    private function ohmPrefixFactor(string $p): float
    {
        return match (mb_strtolower($p)) {
            'k' => 1e3,
            'm' => 1e6,
            'g' => 1e9,
            default => 1.0,
        };
    }

    /**
     * Returns the SMD package code (e.g. "0603") if the part looks surface-mount, else null.
     * Checks the footprint name, then the part name/description, for a known chip code.
     */
    private function detectSmdPackage(Part $part): ?string
    {
        $haystacks = [];
        if ($part->getFootprint() !== null) {
            $haystacks[] = $part->getFootprint()->getName();
        }
        $haystacks[] = $part->getName();
        $haystacks[] = $part->getDescription();

        foreach ($haystacks as $text) {
            if ($text === '') {
                continue;
            }
            foreach (self::SMD_PACKAGES as $pkg) {
                //Match the code as a standalone token so "0603" doesn't match inside "10603".
                if (preg_match('/(^|[^0-9])'.$pkg.'([^0-9]|$)/', $text) === 1) {
                    return $pkg;
                }
            }
        }

        return null;
    }

    /**
     * SI prefix -> factor. Only the single-letter "m" (milli) vs "M" (mega) distinction is
     * case-sensitive; every other prefix (including the spelled-out "meg" = mega) is matched
     * case-insensitively.
     */
    private function prefixFactor(string $prefix): float
    {
        $prefix = trim($prefix);
        if ($prefix === '' || $prefix === 'M') {
            return $prefix === 'M' ? 1e6 : 1.0;
        }
        if ($prefix === 'm') {
            return 1e-3;
        }

        $factors = ['p' => 1e-12, 'n' => 1e-9, 'u' => 1e-6, 'µ' => 1e-6, 'k' => 1e3, 'meg' => 1e6, 'g' => 1e9];

        return $factors[mb_strtolower($prefix)] ?? 1.0;
    }
}
