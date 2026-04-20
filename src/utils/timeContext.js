const DEFAULT_BOT_TIMEZONE = process.env.BOT_TIMEZONE || 'Asia/Makassar';

const WEEKDAY_TO_INDEX = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
};

function getTimeContextInZone(date = new Date(), timeZone = DEFAULT_BOT_TIMEZONE) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';

    const year = get('year');
    const month = get('month');
    const day = get('day');
    const weekday = get('weekday');

    return {
        hariIdx: WEEKDAY_TO_INDEX[weekday] ?? date.getDay(),
        jamMenit: `${get('hour')}:${get('minute')}`,
        tglKey: `${year}-${month}-${day}`
    };
}

module.exports = {
    DEFAULT_BOT_TIMEZONE,
    getTimeContextInZone
};
