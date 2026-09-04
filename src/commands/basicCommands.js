function createBasicCommandsHandler(deps) {
    const { stats, history, buildHelpMenu, getHealthStatus } = deps;

    return async function handleBasicCommands(ctx) {
        const { cmd, msg, uid } = ctx;

        if (cmd === '!stats') {
            msg.reply(`📊 Total chat: ${stats.totalChats}\nTerakhir aktif: ${stats.lastActive || '-'}`);
            return true;
        }

        if (cmd === '!health') {
            const healthText = typeof getHealthStatus === 'function'
                ? getHealthStatus()
                : 'Health check belum tersedia.';
            msg.reply(healthText);
            return true;
        }

        if (cmd === '!reset') {
            history.delete(uid);
            msg.reply('🔄 Percakapan direset!');
            return true;
        }

        if (cmd === '!help' || cmd === '!menu') {
            msg.reply(buildHelpMenu());
            return true;
        }

        return false;
    };
}

module.exports = {
    createBasicCommandsHandler
};
