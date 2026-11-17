import fileSaver from "file-saver";
import OfflinePluginRuntime from "offline-plugin/runtime";
import swal from "sweetalert";
import Worker from "./worker.js";
import "./../css/style.less";
import Images from "./images.js";

document.addEventListener("DOMContentLoaded", () => {
    const toastMessage = document.getElementById("toastMessage");

    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
        OfflinePluginRuntime.install({
            onInstalled: () => {
                showToastMessage("Ready for install and use offline", 5000, () => {

                });
            },
            onUpdateReady: () => {
                OfflinePluginRuntime.applyUpdate();
            },
            onUpdated: () => {
                showToastMessage("Update installed - Reloading ...", 2000, () => {
                    location.reload();
                });
            }
        });
    }

    const selectInputFileButton = document.getElementById("selectInputFileButton");
    selectInputFileButton.addEventListener("change", startConvert);

    const selectInputFolderButton = document.getElementById("selectInputFolderButton");
    if (supportsFolderSelect()) {
        selectInputFolderButton.parentElement.classList.remove("disabled");
        selectInputFolderButton.addEventListener("change", startConvert);
    }

    function bindRememberedSwitch(id, defaultChecked = false) {
        const input = document.getElementById(id);
        input.checked = localStorage[id] === undefined ? defaultChecked : localStorage[id] === "true";
        input.addEventListener("change", () => {
            localStorage[id] = input.checked;
        });
        return input;
    }

    const experimentalSwitch = bindRememberedSwitch("experimentalSwitch");
    const optifineRandomBlockVariantsSwitch = bindRememberedSwitch("optifineRandomBlockVariantsSwitch");
    const includeMaterialMapsSwitch = bindRememberedSwitch("includeMaterialMapsSwitch", true);
    const customBlockModelsSwitch = document.getElementById("customBlockModelsSwitch");
    customBlockModelsSwitch.checked = false;
    const tr = (navigator.language || "").toLowerCase().startsWith("tr");
    if (tr) document.getElementById("customBlockModelsLabel").textContent = "Java özel blok modelleri → Bedrock .mcaddon";
    const customModelWarning = tr
        ? "Deneysel: Bu paket özel blok kimlikleri ekler. Paketi kapatmak blokları geri yüklemez. Yalnızca yedeklenmiş veya gözden çıkarılabilir dünyalarda kullan."
        : "Experimental: this add-on adds custom block IDs. Disabling it does not restore blocks. Use only a backup or a disposable world.";
    document.getElementById("customBlockModelsWarning").textContent = customModelWarning;

    const main = document.querySelector("main");
    main.addEventListener("dragenter", startConvertDrop);
    main.addEventListener("dragleave", startConvertDrop);
    main.addEventListener("dragover", startConvertDrop);
    main.addEventListener("drop", startConvertDrop);

    let worker = null;

    const logs = document.createElement("div");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const downloadLog = document.createElement("button");
    downloadLog.type = "button";
    downloadLog.className = "swal-button";
    downloadLog.textContent = "Download detailed log";
    logs.append(status, downloadLog);
    let logLines = [], startedAt = 0, sourceName = "converted-pack", warnings = 0;
    const seconds = ms => (ms / 1000).toFixed(3) + " s";
    downloadLog.addEventListener("click", () => {
        const body = [`Started: ${new Date(startedAt).toISOString()}`, "", ...logLines, ""].join("\n");
        fileSaver(new Blob([body], { type: "text/plain;charset=utf-8" }), sourceName + "-conversion.log.txt");
    });

    /**
     * @param {string} message
     * @param {number} duration
     * @param {function} func
     */
    function showToastMessage(message, duration, func) {
        toastMessage.innerText = message;

        toastMessage.dataset.show = "true";

        toastMessage.addEventListener("click", hide);

        setTimeout(hide, duration);

        function hide() {
            toastMessage.removeEventListener("click", hide);

            delete toastMessage.dataset.show;

            func();
        }
    }

    /**
     * @returns {boolean}
     */
    function supportsFolderSelect() {
        return (
            "webkitdirectory" in HTMLInputElement.prototype &&
            "webkitRelativePath" in File.prototype &&
            !(
                navigator.userAgent.match(/Mobile/i) ||
                (navigator.userAgent.match(/Safari/i) && "standalone" in navigator) // iPadOS
            ));
    }

    /**
     * @returns {Promise<>}
     */
    async function startConvert() {
        const files = this.files;

        if (files.length === 0) {
            return;
        }

        logLines = [];
        warnings = 0;
        appendLogBatch.lastMs = 0;
        startedAt = Date.now();
        const first = files[0];
        sourceName = (first.webkitRelativePath?.split("/")[0] || first.name || "converted-pack")
            .replace(/\.(zip|mcpack|mcaddon)$/i, "").replace(/[^\w.-]/g, "_") || "converted-pack";
        const customBlockModels = customBlockModelsSwitch.checked;
        if (customBlockModels && !window.confirm(customModelWarning)) return;
        status.textContent = "Starting conversion…";
        downloadLog.disabled = true;

        swal({
            title: "Conversion in progress",
            content: logs,
            buttons: {
                save: {
                    text: "Save",
                    className: "swal-button--loading"
                }
            },
            closeOnClickOutside: false,
            closeOnEsc: false
        });
        document.querySelector(".swal-button--loading").disabled = true;

        try {
            if (worker !== null) {
                worker.terminate();
                worker = null;
            }
            worker = new Worker();
            worker.addEventListener("message", afterConvert);
            worker.addEventListener("error", errorConvert);
            worker.postMessage({
                files,
                options: {
                    experimental: experimentalSwitch.checked,
                    includeMaterialMaps: includeMaterialMapsSwitch.checked,
                    optifineRandomBlockVariants: optifineRandomBlockVariantsSwitch.checked,
                    customBlockModels
                }
            });
        } catch (err) {
            errorConvert(err);
            throw err;
        }
    }

    /**
     * @param {DragEvent} e
     *
     * @returns {Promise<>}
     */
    async function startConvertDrop(e) {
        e.preventDefault();

        this.classList.remove("dragover");

        switch (e.type) {
            case "dragenter":
            case "dragover":
                this.classList.add("dragover");
                break;

            case "drop":
                return startConvert.call(e.dataTransfer);

            default:
                break;
        }
    }

    /**
     * @param {MessageEvent} e
     *
     * @returns {Promise<>}
     */
    async function afterConvert(e) {
        if (e.currentTarget !== worker) return;
        const { logs: batch, output, failure } = e.data;
        if (Array.isArray(batch)) {
            appendLogBatch(batch);
            return;
        }
        if (failure) return errorConvert();
        if (!output) return;
        worker.terminate();
        worker = null;

        // Allow select same file again
        selectInputFileButton.value = selectInputFolderButton.value = "";

        const savePopup = swal({
            title: "Conversion was successful",
            content: logs,
            icon: "success",
            //buttons: ["zip", "mcpack"]
            buttons: "Save"
        });

        status.textContent = "Output ready · " + status.textContent.split(" · ").slice(1).join(" · ");

        if (await savePopup) {
            if (output instanceof File) {
                fileSaver(output);
            } else {
                // TODO: Bug iOS `File` is undefined in worker?
                fileSaver(output.data, output.name);
            }
        }
    }

    /**
     * @param {ErrorEvent} err
     */
    function errorConvert(err) {
        if (err?.currentTarget && err.currentTarget !== worker) return;
        if (worker) worker.terminate();
        worker = null;
        selectInputFileButton.value = selectInputFolderButton.value = "";
        if (err) {
            logLines.push("UI/worker startup error: " + (err.message ?? String(err)));
            downloadLog.disabled = false;
        }
        status.textContent = "Conversion failed. See the detailed log.";
        swal({ title: "Conversion failed", content: logs, icon: "error" });
    }

    function appendLogBatch(batch) {
        let stage = "";
        for (const { elapsedMs, message } of batch) {
            const delta = elapsedMs - (appendLogBatch.lastMs ?? 0);
            appendLogBatch.lastMs = elapsedMs;
            logLines.push(`[+${seconds(elapsedMs)} | Δ ${seconds(delta)}] ${message}`);
            if (message.startsWith("WARNING:")) warnings++;
            if (/^(Start conversion|Read zip|Create metadata|Generate (Blob|File) zip|Conversion finished|Output ready)/.test(message)) stage = message;
        }
        if (batch.length) {
            if (!stage) {
                const last = batch[batch.length - 1].message;
                stage = /OptiFine|CTM/.test(last) ? "Converting connected textures" : "Processing pack";
            }
            status.textContent = `${stage} · ${seconds(appendLogBatch.lastMs)} · ${warnings} warnings`;
            downloadLog.disabled = false;
        }
    }
});