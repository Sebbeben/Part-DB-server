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
import * as bootbox from "bootbox";
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

// Typical dimensions of axial THT resistors per power rating.
// len/dia = body length and diameter (mm), pitch = typical lead spacing (mm).
const RESISTOR_POWERS = {
    "0.125": {label: "1/8 W", len: 3.4, dia: 1.9, pitch: 7.62, pitchIn: "0.3\""},
    "0.25": {label: "1/4 W", len: 6.3, dia: 2.4, pitch: 10.16, pitchIn: "0.4\""},
    "0.5": {label: "1/2 W", len: 9.0, dia: 3.2, pitch: 12.7, pitchIn: "0.5\""},
    "1": {label: "1 W", len: 11.5, dia: 4.5, pitch: 15.24, pitchIn: "0.6\""},
    "2": {label: "2 W", len: 15.5, dia: 5.0, pitch: 20.32, pitchIn: "0.8\""},
};

// Standard SMD (chip) packages: imperial code -> metric code, size (mm), power (W).
const SMD_PACKAGES = {
    "0201": {metric: "0603", l: 0.6, w: 0.3, power: 0.05},
    "0402": {metric: "1005", l: 1.0, w: 0.5, power: 0.063},
    "0603": {metric: "1608", l: 1.6, w: 0.8, power: 0.1},
    "0805": {metric: "2012", l: 2.0, w: 1.25, power: 0.125},
    "1206": {metric: "3216", l: 3.2, w: 1.6, power: 0.25},
    "1210": {metric: "3225", l: 3.2, w: 2.5, power: 0.33},
    "2010": {metric: "5025", l: 5.0, w: 2.5, power: 0.5},
    "2512": {metric: "6332", l: 6.3, w: 3.2, power: 1.0},
};

// Common lead pitches for radial ceramic capacitors.
const CAP_PITCHES = {
    "2.54": "0.1\"",
    "5.08": "0.2\"",
    "7.5": "",
};

const DIM_COLOR = "#6b7280";

export default class extends Controller {
    static targets = [
        "resistorSvg", "bandSelects", "resistorResult", "resistorValueInput", "resistorBodyColor",
        "resistorPower", "resistorSpec",
        "capCodeInput", "capDecodeResult", "capDecodeSvg",
        "capValueInput", "capEncodeResult", "capEncodeSvg", "capBodyColor",
        "capPitch", "capDiameter", "capVoltage", "capSpec",
        "smdCodeInput", "smdResult", "smdSvg", "smdBodyColor", "smdPackage", "smdSpec",
        "previewInput",
    ];

    static values = {
        endpoint: String,
        csrf: String,
    };

    connect() {
        this.bandCount = 5;
        this.renderBandSelects();
        // Sensible default: 4.7 kΩ ±1%
        this.setBandsFromValue(4700, 1);
        this.updateResistor();
        this.updateCapSpec();
    }

    /**
     * Posts the currently shown SVG of the chosen picture to the server so it gets
     * attached to the part the calculator was opened for. A normal form submit is
     * used so the server-side redirect and flash message just work.
     */
    attachToPart(event) {
        if (!this.hasEndpointValue) {
            return;
        }
        const containers = {
            resistor: this.hasResistorSvgTarget ? this.resistorSvgTarget : null,
            capDecode: this.hasCapDecodeSvgTarget ? this.capDecodeSvgTarget : null,
            capEncode: this.hasCapEncodeSvgTarget ? this.capEncodeSvgTarget : null,
            smd: this.hasSmdSvgTarget ? this.smdSvgTarget : null,
        };
        const container = containers[event.currentTarget.dataset.svg];
        const svg = container ? container.innerHTML.trim() : "";
        if (!svg.includes("<svg")) {
            bootbox.alert(trans("tools.value_calc.attach.nothing"));
            return;
        }

        const preview = this.hasPreviewInputTarget ? this.previewInputTarget.checked : true;
        const form = document.createElement("form");
        form.method = "post";
        form.action = this.endpointValue;
        const add = (name, value) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.appendChild(input);
        };
        add("svg", svg);
        add("name", event.currentTarget.dataset.name || "");
        add("preview", preview ? "1" : "0");
        add("_token", this.csrfValue);
        document.body.appendChild(form);
        form.submit();
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

    /** Draws a 3D-shaded axial resistor SVG with bands and dimension callouts. */
    drawResistor(colors) {
        const uid = this.svgId();
        const width = 400;
        const height = 185;
        const cy = 60;
        const bodyX = 96;
        const bodyW = 208;
        const bodyH = 66;
        const bodyY = cy - bodyH / 2;
        const bodyBottom = bodyY + bodyH;

        // Distribute the bands across the body, leaving the tolerance band set apart
        const n = colors.length;
        const bandW = 16;
        const leftPad = 22;
        const rightPad = 32; // extra gap before the tolerance band
        const usable = bodyW - leftPad - rightPad;
        const step = usable / (n - 1);

        let bands = "";
        colors.forEach((name, i) => {
            const c = RESISTOR_COLORS[name];
            // Put the last band (tolerance/temp) towards the right end
            let x = bodyX + leftPad + i * step;
            if (i === n - 1) {
                x = bodyX + bodyW - rightPad + 8;
            }
            bands += `<rect x="${x - bandW / 2}" y="${bodyY - 2}" width="${bandW}" height="${bodyH + 4}" fill="${c.hex}"/>`;
        });

        const body = this.bodyColor(this.hasResistorBodyColorTarget ? this.resistorBodyColorTarget : null, "#d8c7a0");
        const dim = RESISTOR_POWERS[this.resistorPowerValue()];
        const callouts =
            this.dimH(bodyX, bodyX + bodyW, bodyBottom + 16, `L ${this.formatMm(dim.len)}`)
            + this.dimH(36, width - 36, height - 14, `pitch ${this.formatMm(dim.pitch)} (${dim.pitchIn})`)
            + this.dimV(bodyY, bodyBottom, width - 40, `⌀ ${this.formatMm(dim.dia)}`, bodyX + bodyW);

        const svg = `
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width: 460px; width: 100%; height: auto;">
            <defs>
                ${this.leadGradient(uid)}
                ${this.cylinderGradient(uid)}
                ${this.endVignetteGradient(uid)}
                ${this.blurFilter(uid)}
                <clipPath id="${uid}clip"><rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="20" ry="20"/></clipPath>
                ${this.shadowFilter(uid)}
            </defs>
            <g filter="url(#${uid}shadow)">
                <rect x="6" y="${cy - 5}" width="${width - 12}" height="10" rx="5" fill="url(#${uid}lead)"/>
                <g clip-path="url(#${uid}clip)">
                    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="${body}"/>
                    ${bands}
                    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="url(#${uid}cyl)"/>
                    <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" fill="url(#${uid}vig)"/>
                    <ellipse cx="${width / 2}" cy="${bodyY + bodyH * 0.26}" rx="${bodyW * 0.44}" ry="4.5" fill="#ffffff" opacity="0.45" filter="url(#${uid}blur)"/>
                </g>
                <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="20" ry="20" fill="none" stroke="#00000055" stroke-width="1"/>
            </g>
            ${callouts}
        </svg>`;
        this.resistorSvgTarget.innerHTML = svg;

        if (this.hasResistorSpecTarget) {
            this.resistorSpecTarget.textContent =
                `${dim.label} · ${this.formatMm(dim.len)} × ⌀${this.formatMm(dim.dia)} · pitch ${this.formatMm(dim.pitch)} (${dim.pitchIn})`;
        }
    }

    resistorPowerValue() {
        const v = this.hasResistorPowerTarget ? this.resistorPowerTarget.value : "0.25";
        return RESISTOR_POWERS[v] ? v : "0.25";
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

    /** Draws a glossy 3D ceramic capacitor with the marking and dimension callouts. */
    drawCapacitor(target, marking) {
        const uid = this.svgId();
        const w = 230;
        const h = 205;
        const cx = w / 2;
        const bodyTop = 34;
        const bodyW = 150;
        const bodyH = 100;
        const bodyX = cx - bodyW / 2;
        const bodyBottom = bodyTop + bodyH;
        const cyBody = bodyTop + bodyH / 2;
        const rx = bodyH / 2;
        const fill = this.bodyColor(this.hasCapBodyColorTarget ? this.capBodyColorTarget : null, "#c9a227");
        const textColor = this.contrastColor(fill);
        const shadow = textColor === "#f5f5f5" ? "#00000088" : "#ffffff66";

        const voltage = this.capVoltageValue();
        const codeY = voltage ? cyBody - 8 : cyBody;
        const fontSize = marking.length > 4 ? 26 : 32;
        const voltageSvg = voltage
            ? `<text x="${cx}" y="${cyBody + 20}" text-anchor="middle" dominant-baseline="central"
                     font-family="monospace" font-weight="bold" font-size="15" fill="${textColor}"
                     style="paint-order:stroke" stroke="${shadow}" stroke-width="0.5">${voltage} V</text>`
            : "";

        const leadLen = h - bodyBottom - 24;
        const diam = this.capDiameterValue();
        const pitch = this.capPitchValue();
        const pitchIn = CAP_PITCHES[pitch];
        const pitchLabel = pitchIn ? `pitch ${this.formatMm(parseFloat(pitch))} (${pitchIn})` : `pitch ${this.formatMm(parseFloat(pitch))}`;
        const callouts =
            this.dimH(bodyX, bodyX + bodyW, bodyTop - 12, `⌀ ${this.formatMm(diam)}`)
            + this.dimH(cx - 28, cx + 28, h - 12, pitchLabel);

        const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width: 250px; width: 100%; height: auto;">
            <defs>
                ${this.leadGradient(uid)}
                ${this.glossGradient(uid)}
                ${this.specularGradient(uid)}
                ${this.blurFilter(uid)}
                <clipPath id="${uid}clip"><rect x="${bodyX}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${rx}" ry="${rx}"/></clipPath>
                ${this.shadowFilter(uid)}
            </defs>
            <g filter="url(#${uid}shadow)">
                <rect x="${cx - 26}" y="${bodyBottom - 14}" width="8" height="${leadLen}" rx="4" fill="url(#${uid}lead)" transform="rotate(-7 ${cx - 22} ${bodyBottom - 10})"/>
                <rect x="${cx + 18}" y="${bodyBottom - 14}" width="8" height="${leadLen}" rx="4" fill="url(#${uid}lead)" transform="rotate(7 ${cx + 22} ${bodyBottom - 10})"/>
                <g clip-path="url(#${uid}clip)">
                    <rect x="${bodyX}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" fill="${fill}"/>
                    <rect x="${bodyX}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" fill="url(#${uid}gloss)"/>
                    <ellipse cx="${cx - 6}" cy="${bodyTop + bodyH * 0.3}" rx="${bodyW * 0.44}" ry="${bodyH * 0.28}" fill="url(#${uid}spec)"/>
                    <ellipse cx="${cx - bodyW * 0.22}" cy="${bodyTop + bodyH * 0.22}" rx="14" ry="7" fill="#ffffff" opacity="0.5" filter="url(#${uid}blur)"/>
                    <ellipse cx="${cx}" cy="${bodyBottom}" rx="${bodyW * 0.5}" ry="14" fill="#000000" opacity="0.14"/>
                </g>
                <rect x="${bodyX}" y="${bodyTop}" width="${bodyW}" height="${bodyH}" rx="${rx}" ry="${rx}" fill="none" stroke="#00000055" stroke-width="1"/>
                <text x="${cx}" y="${codeY}" text-anchor="middle" dominant-baseline="central"
                      font-family="monospace" font-weight="bold" font-size="${fontSize}"
                      fill="${textColor}" style="paint-order:stroke" stroke="${shadow}" stroke-width="0.6">${marking}</text>
                ${voltageSvg}
            </g>
            ${callouts}
        </svg>`;
        target.innerHTML = svg;
        this.updateCapSpec();
    }

    capPitchValue() {
        const v = this.hasCapPitchTarget ? this.capPitchTarget.value : "5.08";
        return CAP_PITCHES[v] !== undefined ? v : "5.08";
    }

    capDiameterValue() {
        const v = this.hasCapDiameterTarget ? parseFloat(this.capDiameterTarget.value) : NaN;
        return Number.isFinite(v) && v > 0 ? v : 5;
    }

    capVoltageValue() {
        const v = this.hasCapVoltageTarget ? this.capVoltageTarget.value.trim() : "";
        return /^\d+(\.\d+)?$/.test(v) ? v : "";
    }

    updateCapSpec() {
        if (!this.hasCapSpecTarget) {
            return;
        }
        const pitch = this.capPitchValue();
        const pitchIn = CAP_PITCHES[pitch];
        let spec = `⌀ ${this.formatMm(this.capDiameterValue())} · pitch ${this.formatMm(parseFloat(pitch))}${pitchIn ? ` (${pitchIn})` : ""}`;
        const voltage = this.capVoltageValue();
        if (voltage) {
            spec += ` · ${voltage} V`;
        }
        this.capSpecTarget.textContent = spec;
    }

    /** Re-renders both capacitor pictures when the body color changes. */
    updateCapacitorColor() {
        this.decodeCapacitor();
        this.encodeCapacitor();
    }

    /** Updates the spec line and re-renders both capacitor pictures. */
    updateCapDimensions() {
        this.updateCapSpec();
        this.decodeCapacitor();
        this.encodeCapacitor();
    }

    applyCapBodyColor(event) {
        if (this.hasCapBodyColorTarget) {
            this.capBodyColorTarget.value = event.currentTarget.dataset.color;
        }
        this.updateCapacitorColor();
    }

    /** Unique id prefix per drawn SVG, so gradient/filter ids never collide. */
    svgId() {
        this.svgSeq = (this.svgSeq || 0) + 1;
        return `vc${this.svgSeq}_`;
    }

    /** Vertical metallic gradient used for component leads. */
    leadGradient(uid) {
        return `<linearGradient id="${uid}lead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#9aa0a6"/>
            <stop offset="0.45" stop-color="#f4f6f8"/>
            <stop offset="0.55" stop-color="#e7eaed"/>
            <stop offset="1" stop-color="#6f747a"/>
        </linearGradient>`;
    }

    /** Vertical metallic gradient for SMD terminations. */
    metalGradient(uid) {
        return `<linearGradient id="${uid}metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#eef1f4"/>
            <stop offset="0.5" stop-color="#c2c7cd"/>
            <stop offset="1" stop-color="#9098a0"/>
        </linearGradient>`;
    }

    /** Top-light / bottom-dark overlay that turns a flat shape into a cylinder. */
    cylinderGradient(uid) {
        return `<linearGradient id="${uid}cyl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
            <stop offset="0.16" stop-color="#ffffff" stop-opacity="0.16"/>
            <stop offset="0.46" stop-color="#ffffff" stop-opacity="0"/>
            <stop offset="0.72" stop-color="#000000" stop-opacity="0.16"/>
            <stop offset="1" stop-color="#000000" stop-opacity="0.42"/>
        </linearGradient>`;
    }

    /** Softer top-gloss overlay for caps and SMD bodies. */
    glossGradient(uid) {
        return `<linearGradient id="${uid}gloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.4"/>
            <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.05"/>
            <stop offset="0.62" stop-color="#000000" stop-opacity="0"/>
            <stop offset="1" stop-color="#000000" stop-opacity="0.32"/>
        </linearGradient>`;
    }

    /** Radial highlight used as a specular reflection on the cap body. */
    specularGradient(uid) {
        return `<radialGradient id="${uid}spec" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>`;
    }

    /** Horizontal vignette that darkens the rounded ends of a cylinder. */
    endVignetteGradient(uid) {
        return `<linearGradient id="${uid}vig" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#000000" stop-opacity="0.38"/>
            <stop offset="0.1" stop-color="#000000" stop-opacity="0.06"/>
            <stop offset="0.16" stop-color="#000000" stop-opacity="0"/>
            <stop offset="0.84" stop-color="#000000" stop-opacity="0"/>
            <stop offset="0.9" stop-color="#000000" stop-opacity="0.06"/>
            <stop offset="1" stop-color="#000000" stop-opacity="0.38"/>
        </linearGradient>`;
    }

    /** Soft gaussian blur, used for specular streaks and ground shadows. */
    blurFilter(uid) {
        return `<filter id="${uid}blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3"/>
        </filter>`;
    }

    /** Soft, slightly offset drop shadow filter. */
    shadowFilter(uid) {
        return `<filter id="${uid}shadow" x="-15%" y="-20%" width="130%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.28"/>
        </filter>`;
    }

    /** Horizontal dimension line with end ticks, arrows and a centered label above. */
    dimH(x1, x2, y, label) {
        const t = 4;
        return `<g stroke="${DIM_COLOR}" stroke-width="1" fill="${DIM_COLOR}" font-size="11" font-family="system-ui, Arial, sans-serif">
            <line x1="${x1}" y1="${y - t}" x2="${x1}" y2="${y + t}"/>
            <line x1="${x2}" y1="${y - t}" x2="${x2}" y2="${y + t}"/>
            <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
            <polygon stroke="none" points="${x1},${y} ${x1 + 6},${y - 3} ${x1 + 6},${y + 3}"/>
            <polygon stroke="none" points="${x2},${y} ${x2 - 6},${y - 3} ${x2 - 6},${y + 3}"/>
            <text x="${(x1 + x2) / 2}" y="${y - 5}" text-anchor="middle" stroke="none">${label}</text>
        </g>`;
    }

    /** Vertical dimension line (label centered above) with optional extension lines. */
    dimV(y1, y2, x, label, extFromX = null) {
        const t = 4;
        const ext = extFromX === null ? "" :
            `<line x1="${extFromX}" y1="${y1}" x2="${x + t}" y2="${y1}" stroke-dasharray="2 2"/>
             <line x1="${extFromX}" y1="${y2}" x2="${x + t}" y2="${y2}" stroke-dasharray="2 2"/>`;
        return `<g stroke="${DIM_COLOR}" stroke-width="1" fill="${DIM_COLOR}" font-size="11" font-family="system-ui, Arial, sans-serif">
            ${ext}
            <line x1="${x - t}" y1="${y1}" x2="${x + t}" y2="${y1}"/>
            <line x1="${x - t}" y1="${y2}" x2="${x + t}" y2="${y2}"/>
            <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
            <polygon stroke="none" points="${x},${y1} ${x - 3},${y1 + 6} ${x + 3},${y1 + 6}"/>
            <polygon stroke="none" points="${x},${y2} ${x - 3},${y2 - 6} ${x + 3},${y2 - 6}"/>
            <text x="${x}" y="${y1 - 6}" text-anchor="middle" stroke="none">${label}</text>
        </g>`;
    }

    /** Formats a millimeter value without trailing zeros. */
    formatMm(mm) {
        return `${this.trimNumber(mm)} mm`;
    }

    /** Formats a power rating in watts, preferring the fractional label. */
    formatPower(watts) {
        const fractions = {0.125: "1/8 W", 0.25: "1/4 W", 0.33: "1/3 W", 0.5: "1/2 W"};
        return fractions[watts] ?? `${this.trimNumber(watts)} W`;
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

    /** Draws a 3D-shaded SMD chip resistor with marking and dimension callouts. */
    drawSmd(marking) {
        const uid = this.svgId();
        const w = 290;
        const h = 168;
        const bodyX = 40;
        const bodyY = 30;
        const bodyW = 202;
        const bodyH = 72;
        const capW = 26;
        const cx = bodyX + bodyW / 2;
        const cy = bodyY + bodyH / 2;
        const bodyBottom = bodyY + bodyH;
        const fontSize = marking.length > 4 ? 28 : 34;
        const fill = this.bodyColor(this.hasSmdBodyColorTarget ? this.smdBodyColorTarget : null, "#262626");
        const textColor = this.contrastColor(fill);

        const innerX = bodyX + capW;
        const innerW = bodyW - 2 * capW;
        const pkgKey = this.smdPackageValue();
        const pkg = SMD_PACKAGES[pkgKey];
        const callouts =
            this.dimH(bodyX, bodyX + bodyW, bodyBottom + 16, `L ${this.formatMm(pkg.l)}`)
            + this.dimV(bodyY, bodyBottom, w - 40, `W ${this.formatMm(pkg.w)}`, bodyX + bodyW);

        const svg = `
        <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="max-width: 300px; width: 100%; height: auto;">
            <defs>
                ${this.metalGradient(uid)}
                ${this.glossGradient(uid)}
                ${this.blurFilter(uid)}
                <clipPath id="${uid}clip"><rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="8" ry="8"/></clipPath>
                ${this.shadowFilter(uid)}
            </defs>
            <g filter="url(#${uid}shadow)">
                <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="8" ry="8" fill="url(#${uid}metal)" stroke="#00000055" stroke-width="1"/>
                <g clip-path="url(#${uid}clip)">
                    <rect x="${innerX}" y="${bodyY}" width="${innerW}" height="${bodyH}" fill="${fill}"/>
                    <rect x="${innerX}" y="${bodyY}" width="${innerW}" height="${bodyH}" fill="url(#${uid}gloss)"/>
                    <rect x="${innerX}" y="${bodyY + 2}" width="${innerW}" height="2.5" fill="#ffffff" opacity="0.22"/>
                    <rect x="${innerX - 2}" y="${bodyY}" width="3" height="${bodyH}" fill="#000000" opacity="0.28"/>
                    <rect x="${innerX + innerW - 1}" y="${bodyY}" width="3" height="${bodyH}" fill="#000000" opacity="0.28"/>
                </g>
                <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
                      font-family="monospace" font-weight="bold" font-size="${fontSize}" fill="${textColor}">${marking}</text>
            </g>
            ${callouts}
        </svg>`;
        this.smdSvgTarget.innerHTML = svg;

        if (this.hasSmdSpecTarget) {
            this.smdSpecTarget.textContent =
                `${pkgKey} (${pkg.metric}) · ${this.formatMm(pkg.l)} × ${this.formatMm(pkg.w)} · ${this.formatPower(pkg.power)}`;
        }
    }

    smdPackageValue() {
        const v = this.hasSmdPackageTarget ? this.smdPackageTarget.value : "0805";
        return SMD_PACKAGES[v] ? v : "0805";
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
