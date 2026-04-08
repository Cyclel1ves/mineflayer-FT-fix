const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const physicsPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'physics.js');
const resourcePackPath = path.join(rootDir, 'node_modules', 'mineflayer', 'lib', 'plugins', 'resource_pack.js');
const compilerMinecraftPath = path.join(rootDir, 'node_modules', 'minecraft-protocol', 'src', 'datatypes', 'compiler-minecraft.js');
const sentinel = 'Patch: configuration state must not emit play packets.';
const resourcePackSentinel = "result: TEXTURE_PACK_RESULTS.DECLINED,\n        hash: latestHash";
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
