module.exports = {
    host: process.env.FUNTIME_HOST || 'play.funtime.su',
    port: Number(process.env.FUNTIME_PORT || 25565),
    version: process.env.MC_VERSION || '1.21.11',
    username: process.env.BOT_USERNAME || 'BabaB4oy34rw',
    password: process.env.BOT_PASSWORD || '4323544f42',
    targetAn: process.env.TARGET_AN || 'an318',
    registerDelayMs: Number(process.env.REGISTER_DELAY_MS || 1000),
    loginDelayMs: Number(process.env.LOGIN_DELAY_MS || 1500),
    anCommandDelayMs: Number(process.env.AN_COMMAND_DELAY_MS || 1800),
    acceptTransferResourcePack: process.env.ACCEPT_TRANSFER_RESOURCE_PACK !== '0'
};
