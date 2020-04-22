export const AM_ID = 'id'
export const AM_DAY = 'day'
export const AM_NAME = 'name'
export const AM_EFFECT = 'effect'
export const AM_EXPANDED = 'expanded'

export class ActionMarkerData {

    constructor(day, name, effect, expanded) {
        this[AM_ID] = 'AM_id_' + Math.ceil(Math.random() * 10000000000000.0) // Needed for drag event listeners
        this[AM_DAY] = day
        this[AM_NAME] = name || 'Action'
        this[AM_EFFECT] = -effect || undefined
        this[AM_EXPANDED] = expanded || false
    }

    // ActionMarker is configurable if it has an effect.
    // Otherwise it's just a visual marker (e.g. to show where an action was taken in precomputed results).
    isConfigurable() {
        return typeof this[AM_EFFECT] !== 'undefined'
    }
}