import { isValidDate } from '../utils.js';
import { map_goh_states_into_UFStates } from './gohs_seir_ode.js';

export function createHistoricalEstimates(hs_parsed, N, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR, undetected_infections, unrecorded_deaths) {
    const g = []
    
    const days = hs_parsed['days']
    const first_date = new Date(hs_parsed['epidemyStartDate'])
    const shiftDays = Math.round(D_incbation + D_infectious)
    for (var day=0-shiftDays; day<days; day++) {
        g[day] = {}
        g[day]['susceptible'] = 0
        g[day]['exposed'] = 0
        g[day]['infectious'] = 0
        g[day]['mild'] = 0
        g[day]['hospital_will_survive'] = 0
        g[day]['hospital_will_die'] = 0
        g[day]['recovered_mild'] = 0
        g[day]['recovered_hospital'] = 0
        g[day]['fatalities'] = 0
        g[day]['not_used_hospitalization_estimate'] = 0
    }

    // Estimate values for fatalities (assume unrecorded fatalities)
    for (var fatalityDay=0; fatalityDay<days; fatalityDay++) {
        const count = hs_parsed['cumulativeConfirmedDeaths'][fatalityDay]
        const adjustedCount = Math.round(count / (1 - unrecorded_deaths))
        g[fatalityDay]['fatalities'] = adjustedCount
    }

    // Estimate values for goh states hospital_will_survive and hospital_will_die
    for (var day=0; day<days; day++) {
        const countWard = hs_parsed['activeHospitalizations'][day]
        const countIcu = hs_parsed['activeICU'][day]
        const countBoth = countWard + countIcu
        const proportionOfHospitaliedWhoWillDie = CFR / (CFR + P_SEVERE)
        g[day]['hospital_will_die'] = Math.round(proportionOfHospitaliedWhoWillDie * countBoth)
        g[day]['hospital_will_survive'] = countBoth - g[day]['hospital_will_die']
    }

    // Estimate values for other states.
    for (var confirmedCaseDay=0; confirmedCaseDay<days; confirmedCaseDay++) {

        // Assume undetected_infections
        const count = hs_parsed['newConfirmedCases'][confirmedCaseDay]
        const adjustedCount = Math.round(count / (1 - undetected_infections))

        // Assume that all confirmed cases occur immediately after the infectious period (because diagnosis leads to self-isolation etc.)
        // Assume that all these confirmed cases were infectious for exactly D_infectious number of days
        const infectiousEndDay = confirmedCaseDay
        const infectiousStartDay = confirmedCaseDay - Math.round(D_infectious) + 1
        for (var infectiousDay=infectiousEndDay; infectiousDay >= infectiousStartDay; infectiousDay--) {
            g[infectiousDay]['infectious'] += adjustedCount
        }

        // Assume that all these confirmed cases were incubating for exactly D_incbation number of days (immediately preceding infectious period)
        const incubationEndDay = infectiousStartDay - 1
        const incubationStartDay = incubationEndDay - Math.round(D_incbation) + 1
        for (var incubationDay=incubationEndDay; incubationDay >= incubationStartDay; incubationDay--) {
            g[incubationDay]['exposed'] += adjustedCount
        }

        // Assume that proportion of people who isolate to home after diagnosis is (1 - P_SEVERE - CFR) (as opposed to hospitalization)
        const mildCount = Math.round((1 - P_SEVERE - CFR) * adjustedCount)
        const mildStartDay = infectiousEndDay+1
        const mildEndDay = mildStartDay + Math.round(D_recovery_mild) - 1
        for (var mildDay=mildStartDay; mildDay<=mildEndDay && mildDay<days; mildDay++) {
            g[mildDay]['mild'] += mildCount
        }
        const mildRecoveredStartDay = mildEndDay+1
        for (var recoveredDay=mildRecoveredStartDay; recoveredDay<days; recoveredDay++) {
            g[recoveredDay]['recovered_mild'] += mildCount
        }

        // We still need to fill up 'recovered_hospital' state.
        // Unfortunately the "recoveries" HS API data has not been updated, so we can not know "new hospitalizations", we only know "active hospitalizations".
        // This prevents us from deriving accurate estimates for mild_recovering, mild_recovered and severe_recovered states
        //     (by "accurate" I mean we could derive these numbers directly from our previous assumptions and data,
        //     as opposed to making new assumptions to get these numbers)
        // Now we have to make new assumptions, and the 'recovered' numbers are not going to be consistent with 'hospitalized' numbers.
        // We could make them consistent by creating 'hospitalized' numbers with the same method, but we don't want to do that,
        // because we have accurate numbers for active hospitalizations, so obviously we will use accurate numbers for those instead of estimates.
        const hospSurvivorCount = Math.round(P_SEVERE * adjustedCount)
        const hospStartDay = infectiousEndDay + 1
        const hospEndDay = hospStartDay + Math.round(D_hospital) - 1
        const recHospStartDay = hospEndDay + 1
        for (var recoveredDay=recHospStartDay; recoveredDay<days; recoveredDay++) {
            g[recoveredDay]['recovered_hospital'] += hospSurvivorCount
        }

        // Lastly, we'll count "expected hospitalizations" according to our model.
        // This value is not actually used for anything (since we get the _actual_
        // hospitalization numbers from data, we rather use those). However, we
        // want to calculate this number to validate our default parameter value
        // choice for hospitalization percentage. We can validate this parameter
        // value by comparing our model's "expected hospitalizations" against
        // "actual hospitalizations" (with the assumption that our other parameter
        // values are correct).
        const hospCount = Math.round((P_SEVERE + CFR) * adjustedCount)
        for (var hospDay=hospStartDay; hospDay<=hospEndDay && hospDay<days; hospDay++) {
            g[hospDay]['not_used_hospitalization_estimate'] += hospCount
        }
    }

    // Console log expected hospitalizations vs actual hospitalizations 
    for (var day=0; day<days; day++) {
        const eh = g[day]['not_used_hospitalization_estimate']
        const ah = g[day]['hospital_will_die'] + g[day]['hospital_will_survive']
        // Uncomment the following line when needed:
        //console.log('Day', day, 'expected hospitalizations', eh, 'versus actual', ah)
    }

    // Cutoff days before day 0 (because we want to lock the first day to 25.3. instead of allowing it to move when the user tunes incubation parameter etc.)
    // Also cutoff days after lastDay-shiftDays (because we can't infer incubations until later, when confirmed cases come in.)
    const shifted = []
    for (var day=0; day<days-shiftDays; day++) {
        shifted[day] = g[day]
    }

    // Turn counts into goh states
    const goh_states = shifted.map(counts => {
        const count_susceptible = N - (counts['exposed'] + counts['infectious'] + counts['mild'] + counts['hospital_will_survive'] + counts['hospital_will_die'] + counts['recovered_mild'] + counts['recovered_hospital'] + counts['fatalities'])
        return [
            count_susceptible / N,
            counts['exposed'] / N,
            counts['infectious'] / N,
            counts['mild'] / N,
            0, // Removed state
            counts['hospital_will_survive'] / N,
            counts['hospital_will_die'] / N,
            counts['recovered_mild'] / N,
            counts['recovered_hospital'] / N,
            counts['fatalities'] / N
        ]
    })

    // Map goh states into user facing states.
    var uf_states = map_goh_states_into_UFStates(goh_states, N, 0)
    for (var day=0; day<days-shiftDays; day++) {
        // Because goh states do not have ICU as a state, we'll put real ward and ICU values in there at this point.
        uf_states[day]['hospitalized'] = hs_parsed['activeHospitalizations'][day]
        uf_states[day]['icu']          = hs_parsed['activeICU'][day]
    }
    
    return [first_date, goh_states, uf_states]
}

// Deprecated function for loading hardcoded historical estimates.
export function loadHardcodedHistoricalEstimates(fin, N, P_ICU) {
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

    var uf_states = map_goh_states_into_UFStates(goh_states, N, P_ICU)
    // Note: if you add real ICU counts to hardcoded historical estimates, this would be the time to put those into uf_states
    // (replacing the values that were generated with P_ICU)
    // (and of course the same should be done for 'hospitalized' counts)

    return [first_date, goh_states, uf_states]
}