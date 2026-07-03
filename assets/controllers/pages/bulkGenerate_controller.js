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

import {Controller} from "@hotwired/stimulus";
import {AlertSwal} from "../../helpers/swal";
import {trans} from "../../translator.js";

/**
 * Drives the hidden value-calculator to render a preview for every candidate row, then attaches the
 * checked ones to their parts via the per-part generate-image endpoint (with a progress bar).
 */
export default class extends Controller {
    static targets = ["row", "progress", "progressBar", "attachBtn"];

    connect() {
        this.tryRenderPreviews(0);
    }

    /** The value-calculator controller instance (retries briefly, since it may connect after us). */
    calcController() {
        const el = this.element.querySelector('[data-controller*="alueCalculator"], [data-controller*="alue-calculator"]');
        if (!el) {
            return null;
        }
        for (const id of ["pages--valueCalculator", "pages--value-calculator"]) {
            const c = this.application.getControllerForElementAndIdentifier(el, id);
            if (c && typeof c.generateSvg === "function") {
                return c;
            }
        }
        return null;
    }

    tryRenderPreviews(attempt) {
        const calc = this.calcController();
        if (!calc) {
            if (attempt < 20) {
                setTimeout(() => this.tryRenderPreviews(attempt + 1), 50);
            }
            return;
        }
        this.rowTargets.forEach((row) => this.renderPreview(row, calc));
    }

    renderPreview(row, calc) {
        const svg = calc.generateSvg(row.dataset.type, parseFloat(row.dataset.value), {
            voltage: row.dataset.voltage ? parseFloat(row.dataset.voltage) : 0,
            package: row.dataset.package || null,
            tolerance: row.dataset.tolerance ? parseFloat(row.dataset.tolerance) : 1,
        });
        row.dataset.svg = svg;
        const cell = row.querySelector("[data-bulk-preview]");
        if (cell) {
            cell.innerHTML = svg || "";
        }
    }

    /** Header checkbox: check/uncheck every row. */
    toggleAll(event) {
        const checked = event.currentTarget.checked;
        this.rowTargets.forEach((row) => {
            const cb = row.querySelector("input[type=checkbox]");
            if (cb) {
                cb.checked = checked;
            }
        });
    }

    async attachSelected() {
        const rows = this.rowTargets.filter((row) => {
            const cb = row.querySelector("input[type=checkbox]");
            return cb && cb.checked && (row.dataset.svg || "").includes("<svg");
        });
        if (rows.length === 0) {
            AlertSwal.fire({title: trans("tools.value_calc.attach.nothing")});
            return;
        }

        if (this.hasAttachBtnTarget) {
            this.attachBtnTarget.disabled = true;
        }
        if (this.hasProgressTarget) {
            this.progressTarget.classList.remove("d-none");
        }

        let done = 0;
        let ok = 0;
        let failed = 0;
        for (const row of rows) {
            const body = new FormData();
            body.append("svg", row.dataset.svg);
            body.append("name", row.dataset.name || "Generated image");
            body.append("preview", "1");
            body.append("_token", row.dataset.csrf || "");

            try {
                const resp = await fetch(row.dataset.endpoint, {
                    method: "POST",
                    body,
                    headers: {"X-Requested-With": "XMLHttpRequest"},
                });
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data && data.success) {
                    ok++;
                    row.classList.add("table-success");
                } else {
                    failed++;
                    row.classList.add("table-danger");
                }
            } catch (e) {
                failed++;
                row.classList.add("table-danger");
            }
            done++;
            this.updateProgress(done, rows.length);
        }

        if (this.hasAttachBtnTarget) {
            this.attachBtnTarget.disabled = false;
        }
        AlertSwal.fire({
            title: `${ok} / ${rows.length} ${trans("tools.bulk_gen.attached")}${failed ? ` · ${failed} ${trans("tools.bulk_gen.failed")}` : ""}`,
            icon: failed ? "warning" : "success",
        });
    }

    updateProgress(done, total) {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        if (this.hasProgressBarTarget) {
            this.progressBarTarget.style.width = pct + "%";
            this.progressBarTarget.textContent = `${done}/${total}`;
        }
    }
}
