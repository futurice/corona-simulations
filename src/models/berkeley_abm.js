import { UFState } from '../user_facing_states.js';

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

    // TODO figure out what are "RP" and "mc"

    // TODO this / 4486 * N thing should be done in R

    // group 1
    function h(v) {
        return Math.round(v / 4486 * N)
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
            + b[hospitalized_non_critical_will_survive]
            + b[asymptomatic_non_critical_will_die]
            + b[symptomatic_non_critical_will_die]
            + b[hospitalized_non_critical_will_die]

        const hospitalized =
                b[hospitalized_severe_will_survive]
            + b[hospitalized_severe_will_die]

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