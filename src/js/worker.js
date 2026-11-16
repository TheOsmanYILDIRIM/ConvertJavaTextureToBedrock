import { AbstractLog, ArrayInput, FileInputEntry, FileOutput } from "@modifiedcommand/convert-base-api";
import { ConvertJavaTextureToBedrockApi } from "@modifiedcommand/convert-minecraft-java-texture-to-bedrock-api";
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

async function buildAddon(outputFs, files) {
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
    resourceManifest.dependencies = [
        ...(Array.isArray(resourceManifest.dependencies) ? resourceManifest.dependencies : []),
        { uuid: behaviorHeaderUuid, version: [0, 0, 1] }
    ];

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
    for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;

        if (name.startsWith("j2b_companion/")) {
            const relative = name.slice("j2b_companion/".length);
            if (relative) addon.file("J2B_BP/" + relative, await entry.async("uint8array"));
            continue;
        }

        if (name === "manifest.json") {
            addon.file("J2B_RP/manifest.json", JSON.stringify(resourceManifest, null, 2));
        } else {
            addon.file("J2B_RP/" + name, await entry.async("uint8array"));
        }
    }
    addon.file("J2B_BP/manifest.json", JSON.stringify(behaviorManifest, null, 2));

    const blob = await addon.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
    });

    return downloadable(blob, sourceBaseName(files) + ".mcaddon");
}

addEventListener("message", async e => {
    try {
        const { files, options } = e.data;
        const outputFs = new FileOutput();
        const log = new class extends AbstractLog {
            log(log, log_color_class = undefined) {
                postMessage({ log, log_color_class });
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
                keepCompanionStaging: true
            }
        ).convert();

        const addon = await buildAddon(outputFs, files);
        if (addon !== null) {
            log.log("Custom Java block models detected: output packaged as Bedrock .mcaddon (Resource Pack + companion Behavior Pack)");
            postMessage({ output: addon });
            return;
        }

        const data = (typeof File !== "undefined" && converted instanceof File)
            ? converted
            : (converted?.data || converted);
        postMessage({ output: downloadable(data, sourceBaseName(files) + ".mcpack") });
    } catch (err) {
        setTimeout(() => {
            throw err;
        });
    }
});
