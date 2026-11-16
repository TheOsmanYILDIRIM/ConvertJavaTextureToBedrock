NOT OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG

---

# Web app for converting Minecraft Java texture packs to Bedrock texture packs

## Description

It supports the follow Minecraft versions:

| Minecraft | Version |
|-----------|---------|
| Java | v1.13.x, v1.14.x, v1.15.x or v1.16.x |
| Bedrock | >= v1.16.20 |

This project is inspired by the no longer continued [PCTexture2PE](https://github.com/rodrigojxd/PCTexture2PE)

It supports to convert blocks, items, entities, paintings, particles, map icons, mob effects and hotbar

Please note:

- No guarantee it will work
- Each texture pack could be different and may not work or only partially
- Please notice your browser is be supported
- Works directly in your browser - no upload required and offline usage
- Some conversions of HD texture packs may takes a while
- You need a device with corresponding enough RAM (like the file size and content of the texture pack), because the convert it is not stored in a temporary storage, but in the RAM memory
- Java 26.3 fork build supports the safe OptiFine/Continuity random block-texture subset and an experimental standard Java custom block-model path. Custom block models are emitted as a Bedrock `.mcaddon` containing a Resource Pack plus a small JSON-only companion Behavior Pack. Conditional multipart models and custom items remain incomplete. Shaders, arbitrary mods/datapacks and fonts are still outside this scope.
- Snapshots or never versions may are also not supported
- If textures of sprites (For instance banner pattern, painting and particle) are only partially available, the missing will be transparent
- Please reopen Minecraft after selecting the converted texture pack, because in the current version it seems to be a bug to reload the texture cache (Otherwise it's possible that you will have a mix between your previous and new texture pack, which can lead to appearance bugs that would not occur)
- If it crashed, it doesn't necessarily have to do with the texture pack and this converter can't do much if it should be a bug in Minecraft
- Please don't report Java or Bedrock version changes

Some experimental conversions are disabled by default, but can be enabled if you want to try, but please be warned, it contains many bugs and may are not beautiful and may not usable:
- Horses
- UI
    - Buttons
    - Tabs
    - Dialogs
    - Inventory / Recipe book
    - Crafting tables
- Weather (Rain/Snow)

## Requirements

Works in a current browser

Tested browsers:
- Desktop:
  - Chrome (General Chromium based browsers should work, like Opera, new Edge, ...)
  - Firefox
  - Safari
- Mobile:
  - iOS (Safari)
  - Android (Chrome)

Internet Explorer or old Edge are not supported!

## Web app
* This fork is published through GitHub Pages at `https://theosmanyildirim.github.io/ConvertJavaTextureToBedrock/`

## API
* Look at [TheOsmanYILDIRIM/ConvertJavaTextureToBedrockApi](https://github.com/TheOsmanYILDIRIM/ConvertJavaTextureToBedrockApi)
