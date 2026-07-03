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

    /**
     * Classifies a part.
     *
     * @return array{type: 'resistor'|'smd_resistor'|'capacitor', value: float, package: string|null,
     *               voltage: int|null, tolerance: string|null}|null
     *              value is ohms (resistors) or farads (capacitors); null if it can't be classified.
     */
    public function guess(Part $part): ?array
    {
        [$ohms, $farads] = $this->extractValue($part);
        $tolerance = $this->detectTolerance($part);

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
            ];
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

        $text = $part->getName().' '.($part->getDescription() ?? '');
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

        $text = $part->getName().' '.($part->getDescription() ?? '');
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

        if (preg_match('/(\d+(?:[.,]\d+)?)\s*V(?:DC|AC)?\b/iu', $part->getName().' '.($part->getDescription() ?? ''), $m) === 1) {
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

        $text = $part->getName().' '.($part->getDescription() ?? '');
        if (preg_match('/±\s*(\d+(?:[.,]\d+)?)\s*%/u', $text, $m) === 1
            || preg_match('/\b(\d+(?:[.,]\d+)?)\s*%/u', $text, $m) === 1) {
            return '±'.str_replace(',', '.', $m[1]).'%';
        }

        return null;
    }

    /**
     * Extracts the resistance (ohms) and/or capacitance (farads) of a part: first from its
     * parameters, then (for parts named by their value, e.g. "10nF") from the name/description.
     *
     * @return array{0: float|null, 1: float|null}
     */
    public function extractValue(Part $part): array
    {
        try {
            [$ohms, $farads] = $this->fromParameters($part);
            if ($ohms !== null || $farads !== null) {
                return [$ohms, $farads];
            }

            $text = trim($part->getName().' '.($part->getDescription() ?? ''));

            //A farad unit is unambiguous, so a capacitance found in the name wins.
            $farads = $this->parseFaradsFromText($text);
            if ($farads !== null) {
                return [null, $farads];
            }

            return [$this->parseOhmsFromText($text), null];
        } catch (\Throwable) {
            return [null, null];
        }
    }

    /**
     * Reads the resistance/capacitance from the part's parameters. The number lives in
     * value_typical; its SI prefix is baked into the unit string (e.g. 4.7 + "kΩ" -> 4700 Ω).
     *
     * @return array{0: float|null, 1: float|null}
     */
    private function fromParameters(Part $part): array
    {
        $ohms = null;
        $farads = null;

        foreach ($part->getParameters() as $param) {
            $name = mb_strtolower($param->getName());
            $unit = trim($param->getUnit() ?? '');

            $isRes = preg_match('/resist|widerstand|ohm/u', $name) === 1
                || str_contains($unit, 'Ω') || stripos($unit, 'ohm') !== false;
            $isCap = preg_match('/capacit|kapazit|farad/u', $name) === 1
                || preg_match('/^(meg|[pnuµmkMg])?F$/u', $unit) === 1;

            if (!$isRes && !$isCap) {
                continue;
            }

            $num = $param->getValueTypical();
            if ($num === null || $num <= 0) {
                continue;
            }

            $prefix = (string) preg_replace('/(Ω|ohms?|F|farads?)$/iu', '', $unit);
            $value = $num * $this->prefixFactor($prefix);

            if ($isRes && $ohms === null) {
                $ohms = $value;
            } elseif ($isCap && $farads === null) {
                $farads = $value;
            }
        }

        return [$ohms, $farads];
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

    /** Parses a resistance (ohms) out of free text like "4k7", "10k", "470R" or "4.7kΩ", else null. */
    private function parseOhmsFromText(string $text): ?float
    {
        //RKM notation, e.g. 4k7 = 4.7 kΩ, 1R5 = 1.5 Ω, 2M2 = 2.2 MΩ.
        if (preg_match('/\b(\d+)(R|k|K|M|G)(\d+)\b/u', $text, $m) === 1) {
            $factor = strtoupper($m[2]) === 'R' ? 1.0 : $this->ohmPrefixFactor($m[2]);

            return (float) ($m[1].'.'.$m[3]) * $factor;
        }
        //Number followed by a magnitude letter, e.g. 10k, 4.7M, 470R.
        if (preg_match('/(\d+(?:[.,]\d+)?)\s*(k|K|M|G|R)\b/u', $text, $m) === 1) {
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
            if ($text === null || $text === '') {
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
     * SI prefix -> factor. Case sensitive only for m (milli) vs M (mega).
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
