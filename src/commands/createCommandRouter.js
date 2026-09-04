const { createBasicCommandsHandler } = require('./basicCommands');
const { createMediaCommandsHandler } = require('./mediaCommands');

function createCommandRouter(deps) {
    const handleBasicCommands = createBasicCommandsHandler({
        stats: deps.stats,
        history: deps.history,
        buildHelpMenu: deps.buildHelpMenu,
        getHealthStatus: deps.getHealthStatus
    });

    const handleMediaCommands = createMediaCommandsHandler({
        client: deps.client,
        path: deps.path,
        fs: deps.fs,
        sharp: deps.sharp,
        axios: deps.axios,
        MessageMedia: deps.MessageMedia,
        buatStiker: deps.buatStiker,
        kirimStiker: deps.kirimStiker,
        optimizeVideo: deps.optimizeVideo,
        downloadIGVideo: deps.downloadIGVideo,
        downloadTikTokVideo: deps.downloadTikTokVideo,
        downloadYouTubeVideo: deps.downloadYouTubeVideo,
        removeBackground: deps.removeBackground,
        upscaleImage: deps.upscaleImage,
        jobQueue: deps.jobQueue,
        rateLimiter: deps.rateLimiter
    });

    return async function handleCommand(msg) {
        const uid = msg.from;
        const cmd = msg.body.toLowerCase().trim();

        if (await handleBasicCommands({ cmd, msg, uid })) return;
        if (await handleMediaCommands({ cmd, msg, uid })) return;
    };
}

module.exports = {
    createCommandRouter
};
