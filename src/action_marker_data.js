export const AM_DAY = 'day'
export const AM_NAME = 'name'
export const AM_EFFECT = 'effect'

export class ActionMarkerData {

    constructor(day, name, effect) {
        this[AM_DAY] = day
        this[AM_NAME] = name || 'Action'
        this[AM_EFFECT] = effect || undefined
    }

    // ActionMarker is configurable if it has an effect.
    // Otherwise it's just a visual marker (e.g. to show where an action was taken in precomputed results).
    isConfigurable() {
        return typeof this[AM_EFFECT] !== 'undefined'
    }
}