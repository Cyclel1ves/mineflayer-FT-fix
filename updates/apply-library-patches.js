const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const physicsPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'physics.js');
const resourcePackPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'resource_pack.js');
const settingsPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'settings.js');
const entitiesPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'entities.js');
const playClientPath = path.join(rootDir, 'node_modules', 'minecraft-protocol', 'src', 'client', 'play.js');
const protocolJsonPath = path.join(rootDir, 'node_modules', 'minecraft-data', 'minecraft-data', 'data', 'pc', '1.21.11', 'protocol.json');
const registryPath = path.join(rootDir, 'node_modules', 'prismarine-registry', 'lib', 'pc', 'index.js');
const compilerMinecraftPath = path.join(rootDir, 'node_modules', 'minecraft-protocol', 'src', 'datatypes', 'compiler-minecraft.js');
const sentinel = 'Patch: configuration state must not emit play packets.';
const resourcePackSentinel = "result: TEXTURE_PACK_RESULTS.DECLINED,\n        hash: latestHash";
const settingsSentinel = 'function sendConfigurationSettings () {';
const knownPacksSentinel = 'const packs = Array.isArray(packet?.packs)';
const entitiesSentinel = 'Array.isArray(packet.equipments)';
const equipmentPacketSentinel = '"name":"rawEquipmentData"';
const registrySentinel = 'const fallbackEntries = staticData.loginPacket.dimensionCodec?.[codec.id]?.entries || []';
const uuidWriterSentinel = "typeof value === 'object' && typeof value.ascii === 'string'";

function replaceOnce(source, from, to, label) {
    if (!source.includes(from)) {
        throw new Error(`Patch anchor not found for ${label}`);
    }
    return source.replace(from, to);
}

function patchPhysicsPlugin(source) {
    if (source.includes(sentinel)) {
        return { changed: false, source };
    }
    if (source.includes('configuration state must not emit play packets.')) {
        return {
            changed: true,
            source: source.replaceAll(/\/\/ .*configuration state must not emit play packets\./g, `// ${sentinel}`)
        };
    }

    let next = source;

    next = replaceOnce(
        next,
        "  const positionUpdateSentEveryTick = bot.supportFeature('positionUpdateSentEveryTick')\n",
        "  const positionUpdateSentEveryTick = bot.supportFeature('positionUpdateSentEveryTick')\n" +
            "  // Patch: configuration state must not emit play packets.\n" +
            "  function isClientInPlayState () {\n" +
            "    return String(bot._client?.state || '').toLowerCase() === 'play'\n" +
            "  }\n",
        'play-state helper'
    );

    next = replaceOnce(
        next,
        "  function tickPhysics (now) {\n    if (!bot.entity?.position || !Number.isFinite(bot.entity.position.x)) return // entity not ready\n    if (bot.blockAt(bot.entity.position) == null) return // check if chunk is unloaded\n",
        "  function tickPhysics (now) {\n    if (!bot.entity?.position || !Number.isFinite(bot.entity.position.x)) return // entity not ready\n    if (bot.blockAt(bot.entity.position) == null) return // check if chunk is unloaded\n    if (!isClientInPlayState()) return\n",
        'tickPhysics guard'
    );

    next = replaceOnce(
        next,
        "  function sendPacketPosition (position, onGround) {\n    // sends data, no logic\n",
        "  function sendPacketPosition (position, onGround) {\n    // sends data, no logic\n    if (!isClientInPlayState()) return\n",
        'sendPacketPosition guard'
    );

    next = replaceOnce(
        next,
        "  function sendPacketLook (yaw, pitch, onGround) {\n    // sends data, no logic\n",
        "  function sendPacketLook (yaw, pitch, onGround) {\n    // sends data, no logic\n    if (!isClientInPlayState()) return\n",
        'sendPacketLook guard'
    );

    next = replaceOnce(
        next,
        "  function sendPacketPositionAndLook (position, yaw, pitch, onGround) {\n    // sends data, no logic\n",
        "  function sendPacketPositionAndLook (position, yaw, pitch, onGround) {\n    // sends data, no logic\n    if (!isClientInPlayState()) return\n",
        'sendPacketPositionAndLook guard'
    );

    next = replaceOnce(
        next,
        "  function updatePosition (now) {\n    // Only send updates for 20 ticks after death\n",
        "  function updatePosition (now) {\n    if (!isClientInPlayState()) return\n    // Only send updates for 20 ticks after death\n",
        'updatePosition guard'
    );

    next = replaceOnce(
        next,
        "    } else if (positionUpdateSentEveryTick || onGround !== lastSent.onGround) {\n      // For versions < 1.12, one player packet should be sent every tick\n      // for the server to update health correctly\n      // For versions >= 1.12, onGround !== lastSent.onGround should be used, but it doesn't ever trigger outside of login\n      bot._client.write('flying', {\n",
        "    } else if (positionUpdateSentEveryTick || onGround !== lastSent.onGround) {\n      // For versions < 1.12, one player packet should be sent every tick\n      // for the server to update health correctly\n      // For versions >= 1.12, onGround !== lastSent.onGround should be used, but it doesn't ever trigger outside of login\n      if (!isClientInPlayState()) return\n      bot._client.write('flying', {\n",
        'flying guard'
    );

    next = replaceOnce(
        next,
        "  bot.elytraFly = async () => {\n    if (bot.entity.elytraFlying) {\n",
        "  bot.elytraFly = async () => {\n    if (!isClientInPlayState()) {\n      throw new Error('Unable to elytra fly outside play state')\n    }\n    if (bot.entity.elytraFlying) {\n",
        'elytra guard'
    );

    next = replaceOnce(
        next,
        "    if (control === 'jump' && state) {\n      bot.jumpQueued = true\n    } else if (control === 'sprint') {\n      bot._client.write('entity_action', {\n",
        "    if (control === 'jump' && state) {\n      bot.jumpQueued = true\n    } else if (control === 'sprint') {\n      if (!isClientInPlayState()) return\n      bot._client.write('entity_action', {\n",
        'sprint guard'
    );

    next = replaceOnce(
        next,
        "    } else if (control === 'sneak') {\n      if (bot.supportFeature('newPlayerInputPacket')) {\n",
        "    } else if (control === 'sneak') {\n      if (!isClientInPlayState()) return\n      if (bot.supportFeature('newPlayerInputPacket')) {\n",
        'sneak guard'
    );

    return { changed: true, source: next };
}

function patchResourcePackPlugin(source) {
    if (source.includes(resourcePackSentinel)) {
        return { changed: false, source };
    }

    const from = "  function denyResourcePack () {\n    if (bot.supportFeature('resourcePackUsesUUID')) {\n      bot._client.write('resource_pack_receive', {\n        uuid: latestUUID,\n        result: TEXTURE_PACK_RESULTS.DECLINED\n      })\n    }\n    bot._client.write('resource_pack_receive', {\n      result: TEXTURE_PACK_RESULTS.DECLINED\n    })\n  }\n";
    const to = "  function denyResourcePack () {\n    if (bot.supportFeature('resourcePackUsesUUID')) {\n      bot._client.write('resource_pack_receive', {\n        uuid: latestUUID,\n        result: TEXTURE_PACK_RESULTS.DECLINED\n      })\n    } else if (bot.supportFeature('resourcePackUsesHash')) {\n      bot._client.write('resource_pack_receive', {\n        result: TEXTURE_PACK_RESULTS.DECLINED,\n        hash: latestHash\n      })\n    } else {\n      bot._client.write('resource_pack_receive', {\n        result: TEXTURE_PACK_RESULTS.DECLINED\n      })\n    }\n  }\n";

    return {
        changed: source.includes(from),
        source: replaceOnce(source, from, to, 'resource pack deny fix')
    };
}

function patchSettingsPlugin(source) {
    if (source.includes(settingsSentinel)) {
        return { changed: false, source };
    }

    let next = source;

    next = replaceOnce(
        next,
        "    // write the packet\n    bot._client.write('settings', {\n      locale: bot.settings.locale || 'en_US',\n      viewDistance: viewDistanceBits,\n      chatFlags: chatBits,\n      chatColors: bot.settings.colorsEnabled,\n      skinParts,\n      mainHand: handBits,\n      enableTextFiltering: bot.settings.enableTextFiltering,\n      enableServerListing: bot.settings.enableServerListing\n    })\n  }\n",
        "    // write the packet\n    bot._client.write('settings', {\n      locale: bot.settings.locale || 'en_US',\n      viewDistance: viewDistanceBits,\n      chatFlags: chatBits,\n      chatColors: bot.settings.colorsEnabled,\n      skinParts,\n      mainHand: handBits,\n      enableTextFiltering: bot.settings.enableTextFiltering,\n      enableServerListing: bot.settings.enableServerListing,\n      particleStatus: bot.settings.particleStatus || 'all'\n    })\n  }\n",
        'settings packet payload'
    );

    next = replaceOnce(
        next,
        "  bot._client.on('login', () => {\n    setSettings({})\n  })\n\n  bot.setSettings = setSettings\n",
        "  let configurationSettingsSent = false\n\n  function sendConfigurationSettings () {\n    if (String(bot._client?.state || '').toLowerCase() !== 'configuration') return\n    if (configurationSettingsSent) return\n    configurationSettingsSent = true\n    setSettings({})\n  }\n\n  bot._client.on('start_configuration', () => {\n    configurationSettingsSent = false\n    setImmediate(sendConfigurationSettings)\n  })\n\n  bot._client.on('select_known_packs', () => {\n    sendConfigurationSettings()\n  })\n\n  bot._client.on('login', () => {\n    configurationSettingsSent = false\n    setSettings({})\n  })\n\n  bot.setSettings = setSettings\n",
        'configuration settings send'
    );

    return { changed: true, source: next };
}

function patchPlayClient(source) {
    if (source.includes(knownPacksSentinel)) {
        return { changed: false, source };
    }

    const from = "      client.once('select_known_packs', () => {\n        client.write('select_known_packs', { packs: [] })\n      })\n";
    const to = "      client.once('select_known_packs', (packet) => {\n        const packs = Array.isArray(packet?.packs)\n          ? packet.packs\n            .map((pack) => ({\n              namespace: String(pack?.namespace || ''),\n              id: String(pack?.id || ''),\n              version: String(pack?.version || '')\n            }))\n            .filter((pack) => pack.namespace && pack.id && pack.version)\n          : []\n        client.write('select_known_packs', { packs })\n      })\n";

    return {
        changed: source.includes(from),
        source: replaceOnce(source, from, to, 'known packs echo fix')
    };
}

function patchEntitiesPlugin(source) {
    if (source.includes(entitiesSentinel)) {
        return { changed: false, source };
    }

    const from = "  bot._client.on('entity_equipment', (packet) => {\n    // entity equipment\n    const entity = fetchEntity(packet.entityId)\n    if (packet.equipments !== undefined) {\n      packet.equipments.forEach(equipment => entity.setEquipment(equipment.slot, equipment.item ? Item.fromNotch(equipment.item) : null))\n    } else {\n      entity.setEquipment(packet.slot, packet.item ? Item.fromNotch(packet.item) : null)\n    }\n    bot.emit('entityEquip', entity)\n  })\n";
    const to = "  bot._client.on('entity_equipment', (packet) => {\n    // entity equipment\n    const entity = fetchEntity(packet.entityId)\n    if (Array.isArray(packet.equipments)) {\n      packet.equipments.forEach(equipment => entity.setEquipment(equipment.slot, equipment.item ? Item.fromNotch(equipment.item) : null))\n    } else if (packet.slot != null) {\n      entity.setEquipment(packet.slot, packet.item ? Item.fromNotch(packet.item) : null)\n    } else {\n      return\n    }\n    bot.emit('entityEquip', entity)\n  })\n";

    return {
        changed: source.includes(from),
        source: replaceOnce(source, from, to, 'entity equipment guard')
    };
}

function patchProtocolJson(source) {
    if (source.includes(equipmentPacketSentinel)) {
        return { changed: false, source };
    }

    const protocol = JSON.parse(source);
    const packet = protocol?.play?.toClient?.types?.packet_entity_equipment;
    if (!packet) {
        throw new Error('packet_entity_equipment definition not found');
    }

    protocol.play.toClient.types.packet_entity_equipment = [
        'container',
        [
            {
                name: 'entityId',
                type: 'varint'
            },
            {
                name: 'rawEquipmentData',
                type: 'restBuffer'
            }
        ]
    ];

    return {
        changed: true,
        source: `${JSON.stringify(protocol, null, 2)}\n`
    };
}

function patchRegistrySource(source) {
    if (source.includes(registrySentinel)) {
        return { changed: false, source };
    }

    const from = "      if (staticData.supportFeature('segmentedRegistryCodecData')) {\n        // 1.20.5+ - dimension data is now seperated outside the NBT and is sent through\n        // multiple registry_data { id: registryName, entries: [key, registryData] } packets...\n        const entries = codec.entries.map((e, ix) => ({ id: ix, name: e.key, element: nbt.simplify(e.value) }))\n        handlers[codec.id.replace('minecraft:', '')]?.(entries)\n      } else {\n";
    const to = "      if (staticData.supportFeature('segmentedRegistryCodecData')) {\n        // 1.20.5+ - dimension data is now seperated outside the NBT and is sent through\n        // multiple registry_data { id: registryName, entries: [key, registryData] } packets...\n        const fallbackEntries = staticData.loginPacket.dimensionCodec?.[codec.id]?.entries || []\n        const fallbackByKey = new Map(fallbackEntries.map((entry) => [entry.key, entry.value]))\n        const entries = codec.entries\n          .map((e, ix) => {\n            const value = e?.value ?? fallbackByKey.get(e?.key)\n            if (value == null) return null\n            return { id: ix, name: e.key, element: nbt.simplify(value) }\n          })\n          .filter(Boolean)\n        handlers[codec.id.replace('minecraft:', '')]?.(entries)\n      } else {\n";

    return {
        changed: source.includes(from),
        source: replaceOnce(source, from, to, 'registry fallback fix')
    };
}

function patchCompilerMinecraft(source) {
    if (source.includes(uuidWriterSentinel)) {
        return { changed: false, source };
    }

    const from = "    UUID: ['native', (value, buffer, offset) => {\n      const buf = value.length === 32 ? Buffer.from(value, 'hex') : UUID.parse(value)\n      buf.copy(buffer, offset)\n      return offset + 16\n    }],\n";
    const to = "    UUID: ['native', (value, buffer, offset) => {\n      let source = value\n      if (value && typeof value === 'object' && typeof value.ascii === 'string') {\n        source = value.ascii\n      } else if (value && typeof value === 'object' && value.binary && value.binary.length === 16) {\n        source = value.binary\n      }\n      const buf = Buffer.isBuffer(source)\n        ? source\n        : (source.length === 32 ? Buffer.from(source, 'hex') : UUID.parse(source))\n      buf.copy(buffer, offset)\n      return offset + 16\n    }],\n";

    return {
        changed: source.includes(from),
        source: replaceOnce(source, from, to, 'UUID writer fix')
    };
}

function main() {
    if (!fs.existsSync(physicsPath)) {
        throw new Error(`Physics plugin not found: ${physicsPath}`);
    }
    if (!fs.existsSync(resourcePackPath)) {
        throw new Error(`Resource pack plugin not found: ${resourcePackPath}`);
    }
    if (!fs.existsSync(settingsPath)) {
        throw new Error(`Settings plugin not found: ${settingsPath}`);
    }
    if (!fs.existsSync(entitiesPath)) {
        throw new Error(`Entities plugin not found: ${entitiesPath}`);
    }
    if (!fs.existsSync(playClientPath)) {
        throw new Error(`Client play file not found: ${playClientPath}`);
    }
    if (!fs.existsSync(protocolJsonPath)) {
        throw new Error(`Protocol json not found: ${protocolJsonPath}`);
    }
    if (!fs.existsSync(registryPath)) {
        throw new Error(`Registry source not found: ${registryPath}`);
    }
    if (!fs.existsSync(compilerMinecraftPath)) {
        throw new Error(`Compiler minecraft datatype file not found: ${compilerMinecraftPath}`);
    }

    const physicsOriginal = fs.readFileSync(physicsPath, 'utf8');
    const physicsResult = patchPhysicsPlugin(physicsOriginal);
    if (physicsResult.changed) {
        fs.writeFileSync(physicsPath, physicsResult.source, 'utf8');
        console.log('[patch] mineflayer physics patched');
    } else {
        console.log('[patch] mineflayer physics already patched');
    }

    const resourcePackOriginal = fs.readFileSync(resourcePackPath, 'utf8');
    const resourcePackResult = patchResourcePackPlugin(resourcePackOriginal);
    if (resourcePackResult.changed) {
        fs.writeFileSync(resourcePackPath, resourcePackResult.source, 'utf8');
        console.log('[patch] mineflayer resource pack patched');
    } else {
        console.log('[patch] mineflayer resource pack already patched');
    }

    const settingsOriginal = fs.readFileSync(settingsPath, 'utf8');
    const settingsResult = patchSettingsPlugin(settingsOriginal);
    if (settingsResult.changed) {
        fs.writeFileSync(settingsPath, settingsResult.source, 'utf8');
        console.log('[patch] mineflayer settings patched');
    } else {
        console.log('[patch] mineflayer settings already patched');
    }

    const entitiesOriginal = fs.readFileSync(entitiesPath, 'utf8');
    const entitiesResult = patchEntitiesPlugin(entitiesOriginal);
    if (entitiesResult.changed) {
        fs.writeFileSync(entitiesPath, entitiesResult.source, 'utf8');
        console.log('[patch] mineflayer entities patched');
    } else {
        console.log('[patch] mineflayer entities already patched');
    }

    const playClientOriginal = fs.readFileSync(playClientPath, 'utf8');
    const playClientResult = patchPlayClient(playClientOriginal);
    if (playClientResult.changed) {
        fs.writeFileSync(playClientPath, playClientResult.source, 'utf8');
        console.log('[patch] minecraft-protocol known packs patched');
    } else {
        console.log('[patch] minecraft-protocol known packs already patched');
    }

    const protocolJsonOriginal = fs.readFileSync(protocolJsonPath, 'utf8');
    const protocolJsonResult = patchProtocolJson(protocolJsonOriginal);
    if (protocolJsonResult.changed) {
        fs.writeFileSync(protocolJsonPath, protocolJsonResult.source, 'utf8');
        console.log('[patch] minecraft-data entity equipment patched');
    } else {
        console.log('[patch] minecraft-data entity equipment already patched');
    }

    const registryOriginal = fs.readFileSync(registryPath, 'utf8');
    const registryResult = patchRegistrySource(registryOriginal);
    if (registryResult.changed) {
        fs.writeFileSync(registryPath, registryResult.source, 'utf8');
        console.log('[patch] prismarine-registry fallback patched');
    } else {
        console.log('[patch] prismarine-registry fallback already patched');
    }

    const compilerMinecraftOriginal = fs.readFileSync(compilerMinecraftPath, 'utf8');
    const compilerMinecraftResult = patchCompilerMinecraft(compilerMinecraftOriginal);
    if (compilerMinecraftResult.changed) {
        fs.writeFileSync(compilerMinecraftPath, compilerMinecraftResult.source, 'utf8');
        console.log('[patch] minecraft-protocol UUID writer patched');
    } else {
        console.log('[patch] minecraft-protocol UUID writer already patched');
    }
}

try {
    main();
} catch (error) {
    console.error('[patch] failed to patch demo dependencies');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
}
