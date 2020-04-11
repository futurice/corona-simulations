export function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

export function formatCount(count) {
    // Counts are floats in Goh's model, so they need to be rounded.
    // Also formatting to string with space separators etc.
    return formatNumber(Math.round(count))
}

export function formatDelta(delta) {
    return (delta >= 0 ? '+' : '') + formatCount(delta)
}

export function formatPercent(proportion) {
    return (100 * proportion).toFixed(2)
}

export function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export const SHOW_HISTORICAL = 0
export const SHOW_FUTURE = 1
export const SHOW_HISTORICAL_AND_FUTURE = 2

export const MODEL_GOH = 'goh'
export const MODEL_BERKELEY = 'berkeley'
export const MODEL_REINA = 'reina'