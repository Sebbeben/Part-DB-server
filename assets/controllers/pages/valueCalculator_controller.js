/*
 * This file is part of Part-DB (https://github.com/Part-DB/Part-DB-symfony).
 *
 *  Copyright (C) 2019 - 2023 Jan Böhmer (https://github.com/jbtronics)
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

import {Controller} from "@hotwired/stimulus";
import {trans} from "../../translator.js";

/**
 * Color definitions for the resistor color code.
 * digit:      significant figure (null if the color can't be used for a digit band)
 * multiplier: factor applied by a multiplier band
 * tolerance:  tolerance in percent (null if not usable as tolerance band)
 * temp:       temperature coefficient in ppm/K (null if not usable as temp. band)
 * hex/text:   colors used to draw the band and a readable label on top of it
 */
const RESISTOR_COLORS = {
    black:  {digit: 0,    multiplier: 1e0,  tolerance: null, temp: 250,  hex: "#000000", text: "#ffffff"},
    brown:  {digit: 1,    multiplier: 1e1,  tolerance: 1,    temp: 100,  hex: "#5c3a21", text: "#ffffff"},
    red:    {digit: 2,    multiplier: 1e2,  tolerance: 2,    temp: 50,   hex: "#c8102e", text: "#ffffff"},
    orange: {digit: 3,    multiplier: 1e3,  tolerance: null, temp: 15,   hex: "#f25c05", text: "#000000"},
    yellow: {digit: 4,    multiplier: 1e4,  tolerance: null, temp: 25,   hex: "#f2c200", text: "#000000"},
    green:  {digit: 5,    multiplier: 1e5,  tolerance: 0.5,  temp: 20,   hex: "#1a8f3c", text: "#ffffff"},
    blue:   {digit: 6,    multiplier: 1e6,  tolerance: 0.25, temp: 10,   hex: "#0a4ea3", text: "#ffffff"},
    violet: {digit: 7,    multiplier: 1e7,  tolerance: 0.1,  temp: 5,    hex: "#6a2c91", text: "#ffffff"},
    grey:   {digit: 8,    multiplier: 1e8,  tolerance: 0.05, temp: 1,    hex: "#808080", text: "#ffffff"},
    white:  {digit: 9,    multiplier: 1e9,  tolerance: null, temp: null, hex: "#f5f5f5", text: "#000000"},
    gold:   {digit: null, multiplier: 0.1,  tolerance: 5,    temp: null, hex: "#c2a000", text: "#000000"},
    silver: {digit: null, multiplier: 0.01, tolerance: 10,   temp: null, hex: "#b3b3b3", text: "#000000"},
};

// Capacitor tolerance letter codes (percent, or absolute in pF for small caps)
const CAP_TOLERANCE = {
    B: "±0.10 pF", C: "±0.25 pF", D: "±0.5 pF", F: "±1%", G: "±2%",
    J: "±5%", K: "±10%", M: "±20%", Z: "+80% / -20%",
};

// EIA-96 significant value lookup (code 01..96)
const EIA96_VALUES = [
    100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143,
    147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210,
    215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309,
    316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453,
    464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665,
    681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976,
];
const EIA96_MULTIPLIERS = {
    Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, C: 100, D: 1000, E: 10000, F: 100000,
};

export default class extends Controller {
    static targets = [
        "resistorSvg", "bandSelects", "resistorResult", "resistorValueInput", "resistorBodyColor",
        "capCodeInput", "capDecodeResult", "capDecodeSvg",
        "capValueInput", "capEncodeResult", "capEncodeSvg", "capBodyColor",
        "smdCodeInput", "smdResult", "smdSvg", "smdBodyColor",
    ];

    connect() {
        this.bandCount = 5;
        this.renderBandSelects();
        // Sensible default: 4.7 kΩ ±1%
        this.setBandsFromValue(4700, 1);
        this.updateResistor();
    }

    /*
     * ---------------------------------------------------------------
     *  Resistor color code
     * ---------------------------------------------------------------
     */

    changeBandCount(event) {
        this.bandCount = parseInt(event.target.value, 10);
        // Preserve the currently shown value when switching band count
        const current = this.computeResistance();
        this.renderBandSelects();
        if (current && current.ohms > 0) {
            this.setBandsFromValue(current.ohms, current.tolerance);
        }
        this.updateResistor();
    }

    /** Returns the list of band "roles" for the current band count. */
    bandRoles() {
        if (this.bandCount === 4) {
            return ["digit", "digit", "multiplier", "tolerance"];
        }
        if (this.bandCount === 6) {
            return ["digit", "digit", "digit", "multiplier", "tolerance", "temp"];
        }
        return ["digit", "digit", "digit", "multiplier", "tolerance"];
    }

    /** Colors that are valid for a given band role. */
    colorsForRole(role) {
        return Object.keys(RESISTOR_COLORS).filter((name) => RESISTOR_COLORS[name][role] !== null);
    }

    labelForRole(role) {
        return {
            digit: "tools.value_calc.resistor.band_digit",
            multiplier: "tools.value_calc.resistor.band_multiplier",
            tolerance: "tools.value_calc.resistor.band_tolerance",
            temp: "tools.value_calc.resistor.band_temp",
        }[role];
    }

    renderBandSelects() {
        const roles = this.bandRoles();
        let html = "";
        roles.forEach((role, index) => {
            const options = this.colorsForRole(role)
                .map((name) => `<option value="${name}">${this.colorLabel(name)}</option>`)
                .join("");
            const col = roles.length >= 6 ? "col" : "col-sm";
            html += `
                <div class="${col} mb-2">
                    <label class="form-label small text-muted mb-1" data-role-label="${role}"></label>
                    <select class="form-select" data-band-index="${index}"
                            data-action="${this.identifier}#updateResistor">${options}</select>
                </div>`;
        });
        this.bandSelectsTarget.innerHTML = html;

        // Fill in the (translated) role labels via the data-role-label hook.
        this.bandSelectsTarget.querySelectorAll("[data-role-label]").forEach((el) => {
            el.textContent = trans(this.labelForRole(el.dataset.roleLabel));
        });
    }

    colorLabel(name) {
        return trans("tools.value_calc.color." + name);
    }

    /** Reads the currently selected color of every band select. */
    selectedColors() {
        return Array.from(this.bandSelectsTarget.querySelectorAll("select"))
            .map((sel) => sel.value);
    }

    computeResistance() {
        const roles = this.bandRoles();
        const colors = this.selectedColors();
        if (colors.length !== roles.length) {
            return null;
        }

        let digits = "";
        let multiplier = 1;
        let tolerance = null;
        let temp = null;

        roles.forEach((role, i) => {
            const color = RESISTOR_COLORS[colors[i]];
            if (role === "digit") {
                digits += color.digit.toString();
            } else if (role === "multiplier") {
                multiplier = color.multiplier;
            } else if (role === "tolerance") {
                tolerance = color.tolerance;
            } else if (role === "temp") {
                temp = color.temp;
            }
        });

        return {
            ohms: parseInt(digits, 10) * multiplier,
            tolerance,
            temp,
        };
    }

    updateResistor() {
        const res = this.computeResistance();
        if (!res) {
            return;
        }

        let text = this.formatOhms(res.ohms);
        if (res.tolerance !== null) {
            text += ` ±${res.tolerance}%`;
        }
        if (res.temp !== null) {
            text += ` · ${res.temp} ppm/K`;
        }
        this.resistorResultTarget.textContent = text;
        this.drawResistor(this.selectedColors());
    }

    /**
     * Determine the band colors representing the given resistance and write
     * them into the selects.
     */
    setBandsFromValue(ohms, tolerance) {
        if (!(ohms > 0)) {
            return false;
        }
        const numDigits = this.bandCount === 4 ? 2 : 3;

        // Normalize ohms into <numDigits> significant figures + power of ten
        let exp = Math.floor(Math.log10(ohms)) - (numDigits - 1);
        let digits = Math.round(ohms / Math.pow(10, exp));
        if (digits >= Math.pow(10, numDigits)) {
            digits = Math.round(digits / 10);
            exp += 1;
        }
        const multiplier = Math.pow(10, exp);

        // Find a color whose multiplier matches (within float tolerance)
        const multiplierColor = Object.keys(RESISTOR_COLORS).find(
            (name) => RESISTOR_COLORS[name].multiplier !== null
                && Math.abs(RESISTOR_COLORS[name].multiplier - multiplier) < multiplier * 1e-6
        );
        if (!multiplierColor) {
            // Value out of representable range
            return false;
        }

        const digitStr = digits.toString().padStart(numDigits, "0");
        const roles = this.bandRoles();
        const selects = this.bandSelectsTarget.querySelectorAll("select");
        let digitIdx = 0;
        roles.forEach((role, i) => {
            if (role === "digit") {
                selects[i].value = this.colorForDigit(parseInt(digitStr[digitIdx], 10));
                digitIdx += 1;
            } else if (role === "multiplier") {
                selects[i].value = multiplierColor;
            } else if (role === "tolerance" && tolerance !== null && tolerance !== undefined) {
                const tolColor = this.colorForTolerance(tolerance);
                if (tolColor) {
                    selects[i].value = tolColor;
                }
            }
        });
        return true;
    }

    colorForDigit(digit) {
        return Object.keys(RESISTOR_COLORS).find((name) => RESISTOR_COLORS[name].digit === digit);
    }

    colorForTolerance(tolerance) {
        return Object.keys(RESISTOR_COLORS).find(
            (name) => RESISTOR_COLORS[name].tolerance === tolerance
        );
    }

    applyResistorValue() {
        const raw = this.resistorValueInputTarget.value;
        const ohms = this.parseValue(raw, "R");
        if (ohms === null || !(ohms > 0)) {
            this.resistorValueInputTarget.classList.add("is-invalid");
            return;
        }
        // Keep whatever tolerance is currently selected, default to 1%
        const current = this.computeResistance();
        const tol = current && current.tolerance !== null ? current.tolerance : 1;
        if (!this.setBandsFromValue(ohms, tol)) {
            this.resistorValueInputTarget.classList.add("is-invalid");
            return;
        }
        this.resistorValueInputTarget.classList.remove("is-invalid");
        this.updateResistor();
    }

    applyResistorBodyColor(event) {
        if (this.hasResistorBodyColorTarget) {
            this.resistorBodyColorTarget.value = event.currentTarget.dataset.color;
        }
        this.updateResistor();
    }

    /** Draws the resistor SVG with the given band colors. */
    drawResistor(colors) {
        const width = 360;
        const height = 120;
        const bodyX = 70;
        const bodyW = 220;
        const bodyY = 30;
        const bodyH = 60;

        // Distribute the bands across the body, leaving the tolerance band set apart
        const n = colors.length;
        const bandW = 14;
        const leftPad = 18;
        const rightPad = 26; // extra gap before the tolerance band
        const usable = bodyW - leftPad - rightPad;
        const step = usable / (n - 1);

        let bands = "";
        colors.forEach((name, i) => {
            const c = RESISTOR_COLORS[name];
            // Put the last band (tolerance/temp) towards the right end
            let x = bodyX + leftPad + i * step;
            if (i === n - 1) {
                x = bodyX + bodyW - rightPad + 4;
            }
            bands += `<rect x="${x - bandW / 2}" y="${bodyY}" width="${bandW}" height="${bodyH}" fill="${c.hex}" stroke="#0003"/>`;
        });

        const svg = `
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width: 420px; width: 100%; height: auto;">
            <line x1="0" y1="${bodyY + bodyH / 2}" x2="${width}" y2="${bodyY + bodyH / 2}" stroke="#9a9a9a" stroke-width="4"/>
            <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="14" ry="14" fill="${this.bodyColor(this.hasResistorBodyColorTarget ? this.resistorBodyColorTarget : null, "#d8c7a0")}" stroke="#0004" stroke-width="1.5"/>
            ${bands}
        </svg>`;
        this.resistorSvgTarget.innerHTML = svg;
    }

    /*
     * ---------------------------------------------------------------
     *  Capacitor code
     * ---------------------------------------------------------------
     */

    decodeCapacitor() {
        const raw = (this.capCodeInputTarget.value || "").trim().toUpperCase();
        if (raw === "") {
            this.capDecodeResultTarget.textContent = "";
            this.capDecodeSvgTarget.innerHTML = "";
            return;
        }

        // Split off an optional trailing tolerance letter (e.g. the K in 104K)
        let body = raw;
        let tolLetter = null;
        const letterMatch = raw.match(/^([0-9R]+)([A-Z])$/);
        if (letterMatch) {
            body = letterMatch[1];
            tolLetter = letterMatch[2];
        }

        const pf = this.capCodeToPf(body);
        if (pf === null) {
            this.capDecodeResultTarget.textContent = trans("tools.value_calc.invalid_input");
            this.capDecodeSvgTarget.innerHTML = "";
            return;
        }

        let text = `${this.formatFarads(pf)} (${this.formatFarads(pf, true)})`;
        if (tolLetter && CAP_TOLERANCE[tolLetter]) {
            text += ` · ${trans("tools.value_calc.tolerance")}: ${CAP_TOLERANCE[tolLetter]}`;
        } else if (tolLetter) {
            text += ` · ${trans("tools.value_calc.unknown_tolerance")} "${tolLetter}"`;
        }
        this.capDecodeResultTarget.textContent = text;
        this.drawCapacitor(this.capDecodeSvgTarget, body + (tolLetter ?? ""));
    }

    /**
     * Converts a printed ceramic/film capacitor code into picofarads.
     * Supports R-notation (4R7 = 4.7 pF), plain 1-2 digit values (47 = 47 pF)
     * and the 3-digit EIA code (104 = 100 nF, with 8/9 as ×0.01/×0.1).
     * Returns null when the code can't be parsed.
     */
    capCodeToPf(code) {
        if (/^\d*R\d*$/.test(code) && code.includes("R")) {
            // R-notation, e.g. 4R7 = 4.7 pF, R47 = 0.47 pF
            const val = parseFloat(code.replace("R", "."));
            return Number.isNaN(val) ? null : val;
        }
        if (/^\d{1,2}$/.test(code)) {
            // Plain value directly in pF (typical for caps below 100 pF)
            return parseInt(code, 10);
        }
        if (/^\d{3}$/.test(code)) {
            const significant = parseInt(code.substring(0, 2), 10);
            const mult = parseInt(code.charAt(2), 10);
            if (mult === 8) {
                return significant * 0.01;
            }
            if (mult === 9) {
                return significant * 0.1;
            }
            return significant * Math.pow(10, mult);
        }
        return null;
    }

    encodeCapacitor() {
        const raw = this.capValueInputTarget.value;
        const farads = this.parseValue(raw, "F");
        if (farads === null || !(farads > 0)) {
            this.capEncodeResultTarget.textContent = raw.trim() === ""
                ? "" : trans("tools.value_calc.invalid_input");
            this.capEncodeSvgTarget.innerHTML = "";
            return;
        }
        const pf = farads * 1e12;
        const code = this.pfToCapCode(pf);

        if (code === null) {
            this.capEncodeResultTarget.textContent = trans("tools.value_calc.out_of_range");
            this.capEncodeSvgTarget.innerHTML = "";
            return;
        }
        this.capEncodeResultTarget.textContent =
            `${trans("tools.value_calc.capacitor.code")}: ${code} (${this.formatFarads(pf)})`;
        this.drawCapacitor(this.capEncodeSvgTarget, code);
    }

    /**
     * Returns the marking that is typically printed on a ceramic capacitor for
     * the given value in picofarads: R-notation below 10 pF, the plain value
     * for 10-99 pF, and the 3-digit EIA code from 100 pF upwards.
     */
    pfToCapCode(pf) {
        if (pf < 10) {
            // R-notation, e.g. 4.7 -> 4R7, 0.47 -> R47
            const s = parseFloat(pf.toFixed(2)).toString();
            if (Number.isInteger(pf)) {
                return s;
            }
            return s.startsWith("0.") ? "R" + s.slice(2) : s.replace(".", "R");
        }
        if (pf < 100) {
            return Math.round(pf).toString();
        }
        // Two significant figures + power-of-ten multiplier digit
        let exp = Math.floor(Math.log10(pf)) - 1;
        let significant = Math.round(pf / Math.pow(10, exp));
        if (significant >= 100) {
            significant = Math.round(significant / 10);
            exp += 1;
        }
        if (exp < 0 || exp > 7) {
            return null;
        }
        return significant.toString().padStart(2, "0") + exp.toString();
    }

    /** Draws a simple ceramic (radial) capacitor with the marking printed on it. */
    drawCapacitor(target, marking) {
        const w = 220;
        const h = 150;
        const cx = w / 2;
        const bodyTop = 16;
        const bodyW = 130;
        const bodyH = 84;
        const bodyX = cx - bodyW / 2;
        const bodyBottom = bodyTop + bodyH;
        const fontSize = marking.length > 4 ? 24 : 30;
        const fill = this.bodyColor(this.hasCapBodyColorTarget ? this.capBodyColorTarget : null, "#c9a227");
        const textColor = this.contrastColor(fill);

        const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width: 240px; width: 100%; height: auto;">
            <line x1="${cx - 26}" y1="${bodyBottom - 6}" x2="${cx - 26}" y2="${h - 8}" stroke="#9a9a9a" stroke-width="4"/>
            <line x1="${cx + 26}" y1="${bodyBottom - 6}" x2="${cx + 26}" y2="${h - 8}" stroke="#9a9a9a" stroke-width="4"/>
            <rect x="${bodyX}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${bodyH / 2}" ry="${bodyH / 2}"
                  fill="${fill}" stroke="#0005" stroke-width="1.5"/>
            <text x="${cx}" y="${bodyTop + bodyH / 2}" text-anchor="middle" dominant-baseline="central"
                  font-family="monospace" font-weight="bold" font-size="${fontSize}" fill="${textColor}">${marking}</text>
        </svg>`;
        target.innerHTML = svg;
    }

    /** Re-renders both capacitor pictures when the body color changes. */
    updateCapacitorColor() {
        this.decodeCapacitor();
        this.encodeCapacitor();
    }

    applyCapBodyColor(event) {
        if (this.hasCapBodyColorTarget) {
            this.capBodyColorTarget.value = event.currentTarget.dataset.color;
        }
        this.updateCapacitorColor();
    }

    /** Returns the value of a color input, falling back to a default. */
    bodyColor(target, fallback) {
        return target && target.value ? target.value : fallback;
    }

    /** Picks black or white text for readable contrast on the given hex color. */
    contrastColor(hex) {
        const c = hex.replace("#", "");
        if (c.length < 6) {
            return "#1a1100";
        }
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? "#1a1100" : "#f5f5f5";
    }

    /*
     * ---------------------------------------------------------------
     *  SMD resistor code
     * ---------------------------------------------------------------
     */

    decodeSmd() {
        const raw = (this.smdCodeInputTarget.value || "").trim().toUpperCase();
        if (raw === "") {
            this.smdResultTarget.textContent = "";
            this.smdSvgTarget.innerHTML = "";
            return;
        }

        let ohms = null;

        if (raw.includes("R") && /^\d*R\d*$/.test(raw)) {
            // R notation, e.g. 4R7 = 4.7, R47 = 0.47
            ohms = parseFloat(raw.replace("R", "."));
        } else if (/^\d{2}[A-Z]$/.test(raw)) {
            // EIA-96: two digits (value code) + multiplier letter
            const codeNum = parseInt(raw.substring(0, 2), 10);
            const letter = raw.charAt(2);
            if (codeNum >= 1 && codeNum <= 96 && EIA96_MULTIPLIERS[letter] !== undefined) {
                ohms = EIA96_VALUES[codeNum - 1] * EIA96_MULTIPLIERS[letter];
            }
        } else if (/^\d{3}$/.test(raw)) {
            // 3-digit: two significant + multiplier
            ohms = parseInt(raw.substring(0, 2), 10) * Math.pow(10, parseInt(raw.charAt(2), 10));
        } else if (/^\d{4}$/.test(raw)) {
            // 4-digit (E96 precision): three significant + multiplier
            ohms = parseInt(raw.substring(0, 3), 10) * Math.pow(10, parseInt(raw.charAt(3), 10));
        }

        if (ohms === null || Number.isNaN(ohms)) {
            this.smdResultTarget.textContent = trans("tools.value_calc.invalid_input");
            this.smdSvgTarget.innerHTML = "";
            return;
        }
        this.smdResultTarget.textContent = this.formatOhms(ohms);
        this.drawSmd(raw);
    }

    /** Re-renders the SMD chip picture when the body color changes. */
    updateSmdColor() {
        this.decodeSmd();
    }

    applySmdBodyColor(event) {
        if (this.hasSmdBodyColorTarget) {
            this.smdBodyColorTarget.value = event.currentTarget.dataset.color;
        }
        this.decodeSmd();
    }

    /** Draws an SMD chip resistor with the marking printed on the body. */
    drawSmd(marking) {
        const w = 260;
        const h = 130;
        const bodyX = 30;
        const bodyY = 30;
        const bodyW = 200;
        const bodyH = 70;
        const capW = 22;
        const cx = bodyX + bodyW / 2;
        const cy = bodyY + bodyH / 2;
        const fontSize = marking.length > 4 ? 26 : 32;
        const fill = this.bodyColor(this.hasSmdBodyColorTarget ? this.smdBodyColorTarget : null, "#262626");
        const textColor = this.contrastColor(fill);

        const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width: 280px; width: 100%; height: auto;">
            <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="6" ry="6" fill="#c8ccd0" stroke="#0005" stroke-width="1.5"/>
            <rect x="${bodyX + capW}" y="${bodyY}" width="${bodyW - 2 * capW}" height="${bodyH}" fill="${fill}"/>
            <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
                  font-family="monospace" font-weight="bold" font-size="${fontSize}" fill="${textColor}">${marking}</text>
        </svg>`;
        this.smdSvgTarget.innerHTML = svg;
    }

    /*
     * ---------------------------------------------------------------
     *  Helpers
     * ---------------------------------------------------------------
     */

    /**
     * Parses a human entered value like "4k7", "4.7k", "100n", "1M5" into a
     * plain number. baseUnit is "R" (ohms) or "F" (farads) and is used to strip
     * a trailing unit symbol. Returns null if it can't be parsed.
     */
    parseValue(raw, baseUnit) {
        if (raw === null || raw === undefined) {
            return null;
        }
        let s = raw.trim().toLowerCase();
        if (s === "") {
            return null;
        }
        // Strip a trailing unit symbol (ohm, ω, f)
        s = s.replace(/ohm[s]?$/i, "").replace(/Ω/gi, "").trim();
        if (baseUnit === "F") {
            s = s.replace(/farad[s]?$/i, "").replace(/f$/i, "").trim();
        }

        const prefixes = {p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, meg: 1e6, M: 1e6, g: 1e9, G: 1e9};

        // RKM style: prefix used as decimal separator, e.g. 4k7, 1R5, 2u2
        let m = s.match(/^(\d+)\s*(p|n|u|µ|m|k|meg|g|r)\s*(\d+)$/i);
        if (m) {
            const prefix = m[2].toLowerCase();
            const factor = prefix === "r" ? 1 : (prefixes[prefix] ?? prefixes[m[2]] ?? 1);
            return parseFloat(`${m[1]}.${m[3]}`) * factor;
        }

        // Number followed by an optional prefix, e.g. 4.7k, 100n, 470
        m = s.match(/^([\d.]+)\s*(p|n|u|µ|m|k|meg|g|r)?$/i);
        if (m) {
            const num = parseFloat(m[1]);
            if (Number.isNaN(num)) {
                return null;
            }
            if (!m[2] || m[2].toLowerCase() === "r") {
                return num;
            }
            // Case sensitive lookup first (M=mega), then lower case
            const factor = prefixes[m[2]] ?? prefixes[m[2].toLowerCase()];
            return factor ? num * factor : null;
        }

        return null;
    }

    formatOhms(ohms) {
        return this.formatWithPrefix(ohms, "Ω", false);
    }

    /**
     * Formats a capacitance. The input value is always given in picofarads.
     * When pfForm is true, the value is rendered in plain pF, otherwise the most
     * fitting SI prefix (pF/nF/µF/mF/F) is used.
     */
    formatFarads(pf, pfForm = false) {
        if (pfForm) {
            return `${this.trimNumber(pf)} pF`;
        }
        return this.formatWithPrefix(pf * 1e-12, "F", true);
    }

    formatWithPrefix(value, unit, isFarad) {
        if (value === 0) {
            return `0 ${unit}`;
        }
        const steps = isFarad
            ? [[1e-12, "p"], [1e-9, "n"], [1e-6, "µ"], [1e-3, "m"], [1, ""]]
            : [[1e-3, "m"], [1, ""], [1e3, "k"], [1e6, "M"], [1e9, "G"]];

        let chosen = steps[0];
        for (const step of steps) {
            if (value >= step[0]) {
                chosen = step;
            }
        }
        return `${this.trimNumber(value / chosen[0])} ${chosen[1]}${unit}`;
    }

    trimNumber(num) {
        return parseFloat(num.toFixed(3)).toString();
    }
}
