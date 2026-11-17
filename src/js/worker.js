import { AbstractLog, ArrayInput, FileInputEntry, FileOutput } from "@modifiedcommand/convert-base-api";
import { ConvertJavaTextureToBedrockApi, buildOakWorldgenProbe } from "@modifiedcommand/convert-minecraft-java-texture-to-bedrock-api";
import JSZip from "jszip";
import v4 from "uuid/v4.js";

function sourceBaseName(files) {
    if (!files || files.length === 0) return "converted-pack";
    const first = files[0];
    let name = first.webkitRelativePath ? first.webkitRelativePath.split("/")[0] : first.name;
    name = name || "converted-pack";
    return name.replace(/\.(zip|mcpack|mcaddon)$/i, "") || "converted-pack";
}

function downloadable(data, name) {
    if (typeof File !== "undefined") {
        return new File([data], name, { type: "application/zip" });
    }
    return { data, name };
}

async function buildAddon(outputFs, files, log) {
    const zip = outputFs.zip;
    const stagedBlocks = Object.keys(zip.files)
        .filter(name => name.startsWith("j2b_companion/blocks/") && name.endsWith(".json") && !zip.files[name].dir);

    if (stagedBlocks.length === 0) return null;

    const manifestEntry = zip.file("manifest.json");
    if (!manifestEntry) throw new Error("Converted resource pack has no manifest.json");

    const resourceManifest = JSON.parse(await manifestEntry.async("string"));
    const resourceHeaderUuid = resourceManifest?.header?.uuid;
    const resourceVersion = resourceManifest?.header?.version || [0, 0, 1];
    if (!resourceHeaderUuid) throw new Error("Converted resource pack manifest has no header UUID");

    const behaviorHeaderUuid = v4();
    const behaviorModuleUuid = v4();

    resourceManifest.header.pack_scope = "world";
    resourceManifest.header.min_engine_version = [1, 21, 80];

    const behaviorManifest = {
        format_version: 2,
        header: {
            name: (resourceManifest.header.name || "J2B") + " Custom Blocks",
            description: "Companion behavior pack generated from Java custom block models",
            uuid: behaviorHeaderUuid,
            version: [0, 0, 1],
            min_engine_version: [1, 21, 80]
        },
        modules: [{
            type: "data",
            uuid: behaviorModuleUuid,
            version: [0, 0, 1]
        }],
        dependencies: [{
            uuid: resourceHeaderUuid,
            version: resourceVersion
        }]
    };

    const addon = new JSZip();
    const resources = new JSZip();
    const behavior = new JSZip();
    const compression = { type: "uint8array", compression: "DEFLATE" };
    const stagedIds = new Set();
    for (const name of stagedBlocks) {
        const data = JSON.parse(await zip.file(name).async("string"));
        const id = data["minecraft:block"]?.description?.identifier;
        if (typeof id !== "string" || stagedIds.has(id)) throw new Error("Invalid companion block identifier");
        stagedIds.add(id);
        behavior.file(name.slice("j2b_companion/".length), JSON.stringify(data));
    }
    for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || name.startsWith("j2b_companion/") || name === "manifest.json") continue;
        resources.file(name, await entry.async("uint8array"));
    }
    resources.file("manifest.json", JSON.stringify(resourceManifest, null, 2));
    behavior.file("manifest.json", JSON.stringify(behaviorManifest, null, 2));
    addon.file("J2B_RP.mcpack", await resources.generateAsync(compression));
    addon.file("J2B_BP.mcpack", await behavior.generateAsync(compression));

    const report = zip.file("j2b_custom_blocks.json");
    const mapping = report ? JSON.parse(await report.async("string")).mappings : [];
    const probe = buildOakWorldgenProbe(Array.isArray(mapping) ? mapping : [], stagedIds);
    if (probe) {
        const worldgen = new JSZip();
        worldgen.file("manifest.json", JSON.stringify({
            format_version: 2,
            header: {
                name: "pack.name", description: "pack.description",
                uuid: v4(), version: [0, 0, 1], min_engine_version: [1, 21, 80]
            },
            modules: [{ type: "data", uuid: v4(), version: [0, 0, 1] }],
            dependencies: [{ uuid: behaviorHeaderUuid, version: [0, 0, 1] }]
        }, null, 2));
        worldgen.file("texts/languages.json", JSON.stringify(["en_US", "tr_TR"]));
        worldgen.file("texts/en_US.lang",
            "pack.name=J2B Custom Models: Oak Worldgen Probe\npack.description=Disposable worlds only. Disabling this pack does not restore blocks.\n");
        worldgen.file("texts/tr_TR.lang",
            "pack.name=J2B Özel Modeller: Meşe Dünya Üretimi Testi\npack.description=Yalnızca deneme dünyalarında kullan. Kapatmak blokları geri getirmez.\n");
        worldgen.file(probe.path, JSON.stringify(probe.feature, null, 2));
        addon.file("J2B_Oak_Worldgen_Probe.mcpack", await worldgen.generateAsync(compression));
        log.warn("Oak worldgen probe included. Activate only in a disposable world; removal is not certified.");
    } else {
        log.warn("No eligible single-model oak canopy; generated models do not alter world generation.");
    }

    const blob = await addon.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });

    return downloadable(blob, sourceBaseName(files) + ".mcaddon");
}

addEventListener("message", async e => {
    const start = performance.now();
    let pending = [], timer = null;
    const elapsed = () => Math.round(performance.now() - start);
    const flush = () => {
        clearTimeout(timer);
        timer = null;
        if (!pending.length) return;
        postMessage({ logs: pending });
        pending = [];
    };
    const record = (message, color) => {
        pending.push({ elapsedMs: elapsed(), message: String(message), color });
        if (pending.length >= 128) flush();
        else if (timer === null) timer = setTimeout(flush, 250);
    };
    try {
        const { files, options } = e.data;
        record("Conversion requested (worker)");
        record("Options: " + JSON.stringify(options));
        const outputFs = new FileOutput();
        const log = new class extends AbstractLog {
            log(log, log_color_class = undefined) {
                record(log, log_color_class);
            }

            warn(log) {
                this.warnCount();
                this.log("WARNING: " + log, "yellow");
            }
        }();

        const converted = await new ConvertJavaTextureToBedrockApi(
            new ArrayInput(Array.prototype.map.call(files, file => new FileInputEntry(file))),
            outputFs,
            log,
            {
                ...options,
                keepCompanionStaging: options.customBlockModels === true
            }
        ).convert();

        const addon = options.customBlockModels === true ? await buildAddon(outputFs, files, log) : null;
        if (addon !== null) {
            log.log("Custom Java block models detected: output packaged as Bedrock .mcaddon (Resource Pack + companion Behavior Pack)");
            record("Output ready");
            flush();
            postMessage({ output: addon });
            return;
        }

        const data = (typeof File !== "undefined" && converted instanceof File)
            ? converted
            : (converted?.data || converted);
        const output = downloadable(data, sourceBaseName(files) + ".mcpack");
        record("Output ready");
        flush();
        postMessage({ output });
    } catch (err) {
        record("ERROR: " + (err?.message ?? String(err)), "red");
        if (err?.stack) record(err.stack, "red");
        flush();
        postMessage({ failure: true });
    }
});
