require('./.updates/apply-library-patches');

const mineflayer = require('mineflayer');
const config = require('./config');

const RESOURCE_PACK_RESULTS = {
    SUCCESSFULLY_LOADED: 0,
    DECLINED: 1,
    FAILED_DOWNLOAD: 2,
    ACCEPTED: 3
};

function timestamp() {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function log(scope, message) {
    console.log(`[${timestamp()}] [${scope}] ${message}`);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorToMessage(error) {
    if (!error) return '';
    if (typeof error === 'string') return error;
    return String(error.message || error);
}

function isIgnorableProtocolNoise(error) {
    if (!error) return false;
    if (error.partialReadError === true) return true;

    const message = errorToMessage(error).toLowerCase();
    return (
        message.includes('partialreaderror') ||
        message.includes('partial packet') ||
        message.includes('itemfireworkexplosion') ||
        message.includes('itemeffectdetail') ||
        message.includes('slotcomponent') ||
        message.includes('varint is too big')
    );
}

function normalizeAn(targetAn) {
    const text = String(targetAn || '').trim().replace(/^\/+/, '').toLowerCase();
    return text.startsWith('an') ? text : `an${text}`;
}

function attachTransferFix(bot) {
    const client = bot?._client;
    if (!client || client._demoTransferFixAttached) return;
    client._demoTransferFixAttached = true;

    bot.on('resourcePack', (...args) => {
        const state = String(client.state || '').toLowerCase();
        const inTransferWindow = state === 'configuration' || Boolean(bot._transferInProgress);
        const packetUuid = args.find((value) => value && typeof value === 'object' && typeof value.ascii === 'string') || null;
        const uuid = packetUuid?.ascii || null;

        log('RESOURCE_PACK', `event state=${state} uuid=${uuid || 'none'} mode=${config.acceptTransferResourcePack ? 'accept' : 'deny'}`);
        if (!inTransferWindow) return;

        try {
            if (config.acceptTransferResourcePack && typeof bot.acceptResourcePack === 'function') {
                bot.acceptResourcePack();
                return;
            }

            if (typeof client.write !== 'function' || !uuid) return;
            client.write('resource_pack_receive', {
                uuid,
                result: config.acceptTransferResourcePack
                    ? RESOURCE_PACK_RESULTS.ACCEPTED
                    : RESOURCE_PACK_RESULTS.DECLINED
            });

            if (config.acceptTransferResourcePack) {
                setTimeout(() => {
                    try {
                        if (bot.state === 'disconnected') return;
                        client.write('resource_pack_receive', {
                            uuid,
                            result: RESOURCE_PACK_RESULTS.SUCCESSFULLY_LOADED
                        });
                    } catch (error) {
                        log('RESOURCE_PACK', `finish error: ${error.message}`);
                    }
                }, 1500);
            }
        } catch (error) {
            log('RESOURCE_PACK', `handler error: ${error.message}`);
        }
    });

    client.on('packet', (data, meta = {}) => {
        const name = meta?.name;
        if (name === 'start_configuration') {
            bot._transferInProgress = true;
            log('TRANSFER', 'start_configuration');
        } else if (name === 'finish_configuration') {
            bot._transferInProgress = false;
            log('TRANSFER', 'finish_configuration');
        } else if (name === 'add_resource_pack') {
            log('TRANSFER', `add_resource_pack forced=${data?.forced === true} url=${data?.url || 'n/a'}`);
        }
    });
}

function safeChat(bot, command) {
    if (!bot || bot.state === 'disconnected') return false;
    log('CMD', command);
    bot.chat(command);
    return true;
}

async function bootstrap(bot) {
    const targetAn = normalizeAn(config.targetAn);
    await delay(config.registerDelayMs);
    safeChat(bot, `/reg ${config.password}`);
    await delay(config.loginDelayMs);
    safeChat(bot, `/login ${config.password}`);
    await delay(config.anCommandDelayMs);
    safeChat(bot, `/${targetAn}`);
}

const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    hideErrors: true,
    logErrors: false
});

attachTransferFix(bot);

let bootstrapStarted = false;

bot.on('login', () => {
    log('GENERAL', `login state=${bot._client?.state || 'unknown'}`);
});

bot.once('spawn', async () => {
    log('GENERAL', `spawn username=${config.username}`);
    if (bootstrapStarted) return;
    bootstrapStarted = true;
    try {
        await bootstrap(bot);
    } catch (error) {
        log('GENERAL', `bootstrap error: ${error.message}`);
    }
});

bot.on('message', (message) => {
    const raw = message?.toString ? message.toString() : String(message ?? '');
    const text = message?.getText ? message.getText() : raw;
    log('MESSAGE', raw);
    if (text && text !== raw) {
        log('TEXT', text);
    }
});

bot.on('chat', (username, message) => {
    log('CHAT', `[${username}] ${message}`);
});

bot.on('actionBar', (message) => {
    const raw = message?.toString ? message.toString() : String(message ?? '');
    log('ACTION_BAR', raw);
});

bot.on('kicked', (reason) => {
    const text = typeof reason === 'object' ? JSON.stringify(reason) : String(reason);
    log('GENERAL', `kicked reason=${text}`);
});

bot.on('error', (error) => {
    if (isIgnorableProtocolNoise(error)) return;
    log('GENERAL', `error=${error.message}`);
});

bot.on('end', (reason) => {
    log('GENERAL', `end reason=${reason}`);
});

process.on('uncaughtException', (error) => {
    if (isIgnorableProtocolNoise(error)) return;
    log('GENERAL', `uncaughtException=${errorToMessage(error)}`);
});

process.on('unhandledRejection', (error) => {
    if (isIgnorableProtocolNoise(error)) return;
    log('GENERAL', `unhandledRejection=${errorToMessage(error)}`);
});
