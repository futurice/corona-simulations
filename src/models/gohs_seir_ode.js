import { UFState } from '../user_facing_states.js';
import { ActionMarkerData, AM_DAY, AM_EFFECT } from '../action_marker_data.js';

var Integrators = {
    Euler    : [[1]],
    Midpoint : [[.5,.5],[0, 1]],
    Heun     : [[1, 1],[.5,.5]],
    Ralston  : [[2/3,2/3],[.25,.75]],
    K3       : [[.5,.5],[1,-1,2],[1/6,2/3,1/6]],
    SSP33    : [[1,1],[.5,.25,.25],[1/6,1/6,2/3]],
    SSP43    : [[.5,.5],[1,.5,.5],[.5,1/6,1/6,1/6],[1/6,1/6,1/6,1/2]],
    RK4      : [[.5,.5],[.5,0,.5],[1,0,0,1],[1/6,1/3,1/3,1/6]],
    RK38     : [[1/3,1/3],[2/3,-1/3,1],[1,1,-1,1],[1/8,3/8,3/8,1/8]]
};

// f is a func of time t and state y
// y is the initial state, t is the time, h is the timestep
// updated y is returned.
var integrate=(m,f,y,t,h)=>{
    for (var k=[],ki=0; ki<m.length; ki++) {
        var _y=y.slice(), dt=ki?((m[ki-1][0])*h):0;
        for (var l=0; l<_y.length; l++) for (var j=1; j<=ki; j++) _y[l]=_y[l]+h*(m[ki-1][j])*(k[ki-1][l]);
        k[ki]=f(t+dt,_y,dt); 
    }
    for (var r=y.slice(),l=0; l<_y.length; l++) for (var j=0; j<k.length; j++) r[l]=r[l]+h*(k[j][l])*(m[ki-1][j]);
    return r;
}

export function get_solution_from_gohs_seir_ode(actionMarkersForGoh, historical_goh_states, real_dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR) {

    // This used to be a slider in the original Epidemic Calculator.
    const D_death = D_hospital

    var interpolation_steps = 40
    var days_to_simulate = 400
    var steps = 101*interpolation_steps*days_to_simulate/100
    var dt = 1/interpolation_steps
    var sample_step = interpolation_steps

    var method = Integrators["RK4"]
    function f(t, x){

        // SEIR ODE

        // Calculate effects to R0 from actions which occurred before time t.
        const adjustedTime = t + historical_goh_states.length
        var cumulativeActionMarkerEffects = 1
        for (var i=0; i<actionMarkersForGoh.length; i++) {
            const am = actionMarkersForGoh[i]
            const startTime = am[AM_DAY]
            if (adjustedTime > startTime) {
                cumulativeActionMarkerEffects *= (1 - am[AM_EFFECT])
            }
        }
        var beta = cumulativeActionMarkerEffects * R0 / (D_infectious)

        var a        = 1/D_incbation
        var gamma    = 1/D_infectious
        
        var S        = x[0] // Susceptible
        var E        = x[1] // Exposed
        var I        = x[2] // Infectious 
        var Mild     = x[3] // Recovering (Mild)     
        var Severe   = x[4] // Recovering (Severe at home)
        var Severe_H = x[5] // Recovering (Severe in hospital)
        var Fatal    = x[6] // Recovering (Fatal)
        var R_Mild   = x[7] // Recovered
        var R_Severe = x[8] // Recovered
        var R_Fatal  = x[9] // Dead

        var p_severe = P_SEVERE
        var p_fatal  = CFR
        var p_mild   = 1 - P_SEVERE - CFR

        var dS        = -beta*I*S
        var dE        =  beta*I*S - a*E
        var dI        =  a*E - gamma*I
        var dMild     =  p_mild*gamma*I   - (1/D_recovery_mild)*Mild
        var dSevere   =  0 // Modified from Goh's original model: hospitalizations go to hospital without delay.
        var dSevere_H =  p_severe*gamma*I - (1/D_hospital)*Severe_H
        var dFatal    =  p_fatal*gamma*I  - (1/D_death)*Fatal
        var dR_Mild   =  (1/D_recovery_mild)*Mild
        var dR_Severe =  (1/D_hospital)*Severe_H
        var dR_Fatal  =  (1/D_death)*Fatal

        //      0   1   2   3      4        5          6       7        8          9
        return [dS, dE, dI, dMild, dSevere, dSevere_H, dFatal, dR_Mild, dR_Severe, dR_Fatal]
    }

    // If historical data is available, we take the last historical state as our start state.
    var v =
        historical_goh_states ?
        v = historical_goh_states[historical_goh_states.length - 1] :
        [1 - I0/N, 0, I0/N, 0, 0, 0, 0, 0, 0, 0]

    var t = 0
    var goh_states = []
    while (steps--) { 
        if ((steps+1) % (sample_step) == 0) {
            goh_states.push(v.slice())
        }
        v =integrate(method,f,v,t,dt); 
        t+=dt
    }

    const uf_states = map_goh_states_into_UFStates(goh_states, N, P_ICU)

    // We need to remove first element from P_all_goh because the end historical state
    // is used as the start state for the predictions.
    return uf_states.slice(1)
}

/** This was the original mapping from Goh model's internal states into the chartable states.
 * I want to keep it in the code for historical reasons, even though it is no longer used.
 *  Note that these states do not represent the entire population:
 *  - "Recovering" states are not included in any of the 5 output states
 *  - "Susceptible" states, likewise, are not included
 *  When those numbers were needed, Goh's original code had separate functions that
 *  would calculate numbers on need-to-know basis. For example, the tooltip for "removed" would sum up
 *  several chartable states (recovered, hospital, dead) and some states which are not included
 *  in the chart (recovering_mild, recovering_severe_home, recovering_severe_hospital).
 */
function map_goh_states_into_ORIGINAL_user_facing_states(goh_states, N) {
    return goh_states.map(v => {
        const dead = N*v[9]
        const hospitalized = N*(v[5]+v[6])
        const recovered = N*(v[7] + v[8])
        const infectious = N*v[2]
        const exposed = N*v[1]
        return [dead, hospitalized, recovered, infectious, exposed]
    })
}

/** Map Goh model's internal states into states represented by our chart. */
export function map_goh_states_into_UFStates(goh_states, N, P_ICU) {
    return goh_states.map(v => {
        // First, just for readability, we name the states in the array
        const susceptible = v[0]
        const exposed = v[1]
        const infectious = v[2]
        const recovering_mild = v[3]
        const recovering_severe_home = v[4]
        const hospitalized_will_recover = v[5]
        const hospitalized_will_die = v[6]
        const recovered_mild = v[7]
        const recovered_severe = v[8]
        const dead = v[9]

        // Then, compute ChartV2 states.
        const suscep = Math.round(susceptible * N)
        const infected = Math.round((exposed + infectious + recovering_mild + recovering_severe_home) * N)
        const hospitalized_and_icu = Math.round((hospitalized_will_recover + hospitalized_will_die) * N)
        const hospitalized = Math.round((1 - P_ICU) * hospitalized_and_icu)
        const icu = Math.round(P_ICU * hospitalized_and_icu)
        const recovered = Math.round((recovered_mild + recovered_severe) * N)
        const fatalities = Math.round(dead * N)

        return new UFState(
            suscep,
            infected,
            hospitalized,
            icu,
            recovered,
            fatalities
        )
    })
}

export function goh_default_action_markers(P_all_historical) {
    return [
        new ActionMarkerData(108, "Lift restrictions", 0.3),
        new ActionMarkerData(136, "Thing happens", -0.2),
        new ActionMarkerData(165, "Schools open", 0.13),
    ].filter(am => {
        // Prevent action markers from falling behind the historical marker
        return am.day > P_all_historical.length
    })
}