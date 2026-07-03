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
     * @return array{type: 'resistor'|'smd_resistor'|'capacitor', value: float, package: string|null}|null
     *              value is ohms (resistors) or farads (capacitors); null if it can't be classified.
     */
    public function guess(Part $part): ?array
    {
        [$ohms, $farads] = $this->extractValue($part);

        if ($ohms !== null && $ohms > 0) {
            $package = $this->detectSmdPackage($part);

            return [
                'type' => $package !== null ? 'smd_resistor' : 'resistor',
                'value' => $ohms,
                'package' => $package,
            ];
        }

        if ($farads !== null && $farads > 0) {
            return ['type' => 'capacitor', 'value' => $farads, 'package' => null];
        }

        return null;
    }

    /**
     * Extracts the resistance (ohms) and/or capacitance (farads) from the part's parameters.
     * The number lives in value_typical; its SI prefix is baked into the unit string.
     *
     * @return array{0: float|null, 1: float|null}
     */
    public function extractValue(Part $part): array
    {
        $ohms = null;
        $farads = null;

        try {
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
        } catch (\Throwable) {
            return [null, null];
        }

        return [$ohms, $farads];
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
