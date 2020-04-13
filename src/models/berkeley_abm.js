import { UFState } from '../user_facing_states.js';

export function temphack(berkeley_states, berkeley_params, N) {
    var bah = [] 
    for (var i=0; i<=200; i++) {
        bah[i] = {}
    }
    for (var i=0; i<berkeley_states.length; i++) {
        var b = berkeley_states[i]
        if (!Number.isInteger(b.time)) {
            // timestep was 1/2
            continue
        }
        if (b.time == 0) {
            // Due to bug in R code 0 time has only 0 values
            continue
        }
        bah[b.time-1][b.state] = b.mean
    }
    return map_berkeley_states_into_UFStates(bah, N)
}

/** Map Berkeley model's internal states into states represented by our chart. */
export function map_berkeley_states_into_UFStates(berkeley_states, N) {
    const susceptible = 'S'
    const incubating = 'E'
    const asymptomatic = 'A'
    const asymptomatic_non_severe = 'X1'
    const symptomatic_non_hospitalized_non_severe = 'X2'
    const asymptomatic_severe_will_survive = 'C1'
    const symptomatic_non_hospitalized_severe_will_survive = 'C2'
    const hospitalized_severe_will_survive = 'C3'
    const asymptomatic_severe_will_die = 'D1'
    const symptomatic_severe_will_die = 'D2'
    const hospitalized_severe_will_die = 'D3'
    const asymptomatic_non_critical_will_survive = 'HR1'
    const symptomatic_non_critical_will_survive = 'HR2'
    const hospitalized_non_critical_will_survive = 'HR3'
    const asymptomatic_non_critical_will_die = 'HM1'
    const symptomatic_non_critical_will_die = 'HM2'
    const hospitalized_non_critical_will_die = 'HM3'
    const recovered = 'R'
    const dead = 'M'

    const o = berkeley_states[0]
    var fakePop = o['S']
                + o['E']
                + o['A']
                + o['X1']
                + o['X2']
                + o['C1']
                + o['C2']
                + o['C3']
                + o['D1']
                + o['D2']
                + o['D3']
                + o['HR1']
                + o['HR2']
                + o['HR3']
                + o['HM1']
                + o['HM2']
                + o['HM3']
                + o['R']
                + o['M']

    // TODO this should be done in R
    function h(v) {
        return Math.round(v * N / fakePop)
    }

    // TODO verify that states sum up to one for every day

    return berkeley_states.map(b => {

        const suscep =
                b[susceptible]

        const infected =
              b[incubating]
            + b[asymptomatic]
            + b[asymptomatic_non_severe]
            + b[symptomatic_non_hospitalized_non_severe]
            + b[asymptomatic_severe_will_survive]
            + b[symptomatic_non_hospitalized_severe_will_survive]
            + b[asymptomatic_severe_will_die]
            + b[symptomatic_severe_will_die]
            + b[asymptomatic_non_critical_will_survive]
            + b[symptomatic_non_critical_will_survive]
            + b[asymptomatic_non_critical_will_die]
            + b[symptomatic_non_critical_will_die]

        const hospitalized =
                b[hospitalized_non_critical_will_survive]
              + b[hospitalized_non_critical_will_die]

        const icu =
                b[hospitalized_severe_will_survive]
              + b[hospitalized_severe_will_die]

        const recov =
                b[recovered]

        const fatalities =
                b[dead]

        return new UFState(
            h(suscep),
            h(infected),
            h(hospitalized),
            h(icu),
            h(recov),
            h(fatalities)
        )
    }
)}