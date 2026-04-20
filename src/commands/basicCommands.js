function createBasicCommandsHandler(deps) {
    const { userModes, stats, history, buildHelpMenu, getHealthStatus } = deps;

    return async function handleBasicCommands(ctx) {
        const { cmd, msg, uid } = ctx;

        if (cmd === '!mode normal') {
            userModes.set(uid, 'normal');
            msg.reply('✅ Mode: Normal');
            return true;
        }

        if (cmd === '!mode gombal') {
            userModes.set(uid, 'gombal');
            msg.reply('💝 Mode Gombal aktif! Siap baper 😏');
            return true;
        }

        if (cmd === '!mode serious') {
            userModes.set(uid, 'serious');
            msg.reply('🎯 Mode Serius. To the point.');
            return true;
        }

        if (cmd === '!mode story') {
            userModes.set(uid, 'story');
            msg.reply('📖 Mode Story aktif!');
            return true;
        }

        if (cmd === '!mode') {
            msg.reply(`🎭 Mode: ${userModes.get(uid) || 'normal'}\n\n!mode normal\n!mode gombal\n!mode serious\n!mode story`);
            return true;
        }

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
            userModes.delete(uid);
            msg.reply('🔄 Percakapan direset!');
            return true;
        }

        if (cmd === '!help' || cmd === '!menu') {
            const currentMode = userModes.get(uid) || 'normal';
            msg.reply(buildHelpMenu(currentMode));
            return true;
        }

        return false;
    };
}

module.exports = {
    createBasicCommandsHandler
};
