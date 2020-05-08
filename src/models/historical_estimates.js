function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}

export function createFinnishHistoricalEstimates() {
    
}

// Deprecated function for loading hardcoded historical estimates.
export function loadFinnishHistoricalEstimates(fin, N) {
    // This function returns these 2.
    var first_date = new Date()
    var goh_states = []

    var prevRowValid = false
    var day = 0
    for (var i=0; i<fin.length; i++) {
        const row = fin[i]
        const date = new Date(row['Date'])

        // Csv rows come in the following format: first garbage, then data, then more garbage.
        // Rows which have valid date are considered to be non-garbage.
        if (!isValidDate(date)) {
            if (!prevRowValid) {
                continue
            }
            break
        }
        if (isValidDate(date) && !prevRowValid) {
            first_date = date
            prevRowValid = true
        }
        

        function h(col) {
            return parseInt(row[col])
        }

        const susceptible =
            N
            - h('Exposed')
            - h('Infectious')
            - h('Mild')
            - h('SevereHome')
            - h('HospitalWillRecover')
            - h('HospitalFatal')
            - h('RecoveredMild')
            - h('RecoveredSevere')
            - h('Fatal')

        goh_states.push([
            susceptible / N,
            h('Exposed') / N,
            h('Infectious') / N + h('SevereHome') / N, // See the comment below.
            h('Mild') / N,
            0, // Everyone from "severe_home" state moved to infectious (because we effectively removed this state from Goh's model)
            h('HospitalWillRecover') / N,
            h('HospitalFatal') / N,
            h('RecoveredMild') / N,
            h('RecoveredSevere') / N,
            h('Fatal') / N,
        ])

        day++
    }

    return [first_date, goh_states]
}