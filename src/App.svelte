<script>
  
  import { scaleLinear } from "d3-scale";
  // import { Date } from "d3-time"
  import Chart from './Chart.svelte';
  import { onMount } from 'svelte';
  import { selectAll } from 'd3-selection'
  import { drag } from 'd3-drag';
  import queryString from "query-string";
  import Checkbox from './Checkbox.svelte';
  import Arrow from './Arrow.svelte';
  import { format } from 'd3-format';
  import { event } from 'd3-selection';
  import defaultParameters from '../default_parameters.js';

  import katex from 'katex';

  import finnishCoronaData from './../data/finnishCoronaData.json';
  import berkeley_states from './../data/berkeley1.json';
  import finnishHistoricalEstimates from './../data/finnishHistoricalEstimates.csv';



  const legendheight = 67

  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  // This is needed because when we zoom out, Chart needs every nth datapoint from P.
  function get_every_nth(P, n) {
    var arr = []
    for (var i=0; i<P.length; i+=n) {
      arr.push(P[i])
    }
    return arr
  }

  $: allow_x_axis_resizing = false // x axis resizing is broken and needs a complete redesign

  // Chart V2 state object keys
  const K_SUSCEPTIBLE = 'susceptible'
  const K_INF = 'infected'
  const K_HOSPITALIZED = 'hospitalized'
  const K_ICU = 'icu'
  const K_RECOVERED = 'recovered'
  const K_FATALITIES = 'fatalities'

  class State {
    constructor(susceptible, inf, hospitalized, icu, recovered, fatalities) {
      this[K_SUSCEPTIBLE] = susceptible
      this[K_INF] = inf
      this[K_HOSPITALIZED] = hospitalized
      this[K_ICU] = icu
      this[K_RECOVERED] = recovered
      this[K_FATALITIES] = fatalities
    }
  }

  $: stateMeta = [
    {
      'key': K_SUSCEPTIBLE,
      'tooltip_title': 'Susceptible',
      'tooltip_desc': 'Population not immune to the disease',
      'checkable': false,
      'checked': false,
      'color': '#c8ffba',
    },
    {
      'key': K_INF,
      'tooltip_title': 'Infected',
      'tooltip_desc': 'Active infections (incl. incubating, undiagnosed) (excl. hosp, icu)',
      'checkable': true,
      'checked': true,
      'color': '#f0027f',
    },
    {
      'key': K_HOSPITALIZED,
      'tooltip_title': 'Hospitalized',
      'tooltip_desc': 'Active hospitalizations (excluding ICU)',
      'checkable': true,
      'checked': true,
      'color': '#8da0cb'
    },
    {
      'key': K_ICU,
      'tooltip_title': 'ICU',
      'tooltip_desc': 'Patients in intensive care, active',
      'checkable': true,
      'checked': true,
      'color': '#386cb0',
    },
    {
      'key': K_RECOVERED,
      'tooltip_title': 'Recovered',
      'tooltip_desc': 'Number of full recoveries, cumulative',
      'checkable': true,
      'checked': false,
      'color': '#4daf4a',
    },
    {
      'key': K_FATALITIES,
      'tooltip_title': 'Fatalities',
      'tooltip_desc': 'Number of deaths, cumulative',
      'checkable': true,
      'checked': true,
      'color': "#000000",
    },
  ]


  $: Time_to_death     = defaultParameters["days_from_incubation_to_death"]
  $: N                 = defaultParameters["initial_population_count"]
  $: logN              = Math.log(N)
  $: I0                = 1
  $: R0                = defaultParameters["R0"]
  $: D_incbation       = defaultParameters["days_from_incubation_to_infectious"]  
  $: D_infectious      = defaultParameters["days_from_infectious_to_not_infectious"]
  $: D_recovery_mild   = defaultParameters["days_in_mild_recovering_state"]
  $: D_recovery_severe = defaultParameters["days_in_hospital"]
  $: D_hospital_lag    = defaultParameters["days_in_severe_recovering_state_before_hospital"]
  $: D_death           = Time_to_death - D_infectious 
  $: CFR               = defaultParameters["fatality_rate"]
  $: InterventionTime  = defaultParameters["InterventionTime"]
  $: OMInterventionAmt = defaultParameters["OMInterventionAmt"]
  $: InterventionAmt   = 1 - OMInterventionAmt
  $: Time              = 220
  $: Xmax              = 110000
  $: dt                = 1
  $: P_SEVERE          = defaultParameters["hospitalization_rate"]
  $: P_ICU             = defaultParameters["icu_rate_from_hospitalized"]
  $: duration          = 7*12*1e10

  // Default parameters are "activated" on page load with the same mechanism that export uses ("share your model").
  $: state = location.protocol + '//' + location.host + location.pathname + "?" + queryString.stringify({"Time_to_death":Time_to_death,
               "logN":logN,
               "I0":I0,
               "R0":R0,
               "D_incbation":D_incbation,
               "D_infectious":D_infectious,
               "D_recovery_mild":D_recovery_mild,
               "D_recovery_severe":D_recovery_severe,
               "CFR":CFR,
               "InterventionTime":InterventionTime,
               "InterventionAmt":InterventionAmt,
               "D_hospital_lag":D_hospital_lag,
               "P_SEVERE": P_SEVERE})












  /******************************** Gabriel Goh's model from the original Epidemic Calculator. ********************************/

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

  // P_prior, real_dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, CFR, InterventionTime, InterventionAmt, duration
  function get_solution(demo_mode, historical_goh_states, real_dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR, InterventionTime, InterventionAmt, duration) {

    var interpolation_steps = 40
    var steps = 101*interpolation_steps*real_dt
    var dt = 1/interpolation_steps
    var sample_step = interpolation_steps

    var method = Integrators["RK4"]
    function f(t, x){

      // SEIR ODE

      const adjustedInterventionTime =
        demo_mode !== SHOW_FUTURE ?
        InterventionTime - historical_goh_states.length :
        InterventionTime
      
      if (t > adjustedInterventionTime && t < adjustedInterventionTime + duration){
        var beta = (InterventionAmt)*R0/(D_infectious)
      } else if (t > adjustedInterventionTime + duration) {
        var beta = 0.5*R0/(D_infectious)        
      } else {
        var beta = R0/(D_infectious)
      }
      var a     = 1/D_incbation
      var gamma = 1/D_infectious
      
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
      var dSevere   =  p_severe*gamma*I - (1/D_hospital_lag)*Severe
      var dSevere_H =  (1/D_hospital_lag)*Severe - (1/D_recovery_severe)*Severe_H
      var dFatal    =  p_fatal*gamma*I  - (1/D_death)*Fatal
      var dR_Mild   =  (1/D_recovery_mild)*Mild
      var dR_Severe =  (1/D_recovery_severe)*Severe_H
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

    return map_goh_states_into_chartV2_states(goh_states, N, P_ICU)
  }

  /** This was the original mapping from Goh model's internal states into the chartable states.
   *  Note that these states do not represent the entire population:
   *  - "Recovering" states are not included in any of the 5 output states
   *  - "Susceptible" states, likewise, are not included
   *  When those numbers were needed, Goh's original code had separate functions that
   *  would calculate numbers on need-to-know basis. For example, the tooltip for "removed" would sum up
   *  several chartable states (recovered, hospital, dead) and some states which are not included
   *  in the chart (recovering_mild, recovering_severe_home, recovering_severe_hospital).
  */
  function map_goh_states_into_chartV1_states(goh_states, N) {
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
  function map_goh_states_into_chartV2_states(goh_states, N, P_ICU) {
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

      return new State(
        suscep,
        infected,
        hospitalized,
        icu,
        recovered,
        fatalities
      )
    })
  }

  /** Map Berkeley model's internal states into states represented by our chart. */
  function map_berkeley_states_into_chartV2_states(berkeley_states, N) {
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

      return new State(
        h(suscep),
        h(infected),
        h(hospitalized),
        h(icu),
        h(recov),
        h(fatalities)
      )
    })
  }



  /******************************** Historical Estimates From Finnish Data ********************************/

  function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
  }

  let first_date = new Date()

  function loadFinnishHistoricalEstimates(fin, N) {
    var prevRowValid = false
    var day = 0
    var goh_states = []
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
        h('Infectious') / N,
        h('Mild') / N,
        h('SevereHome') / N,
        h('HospitalWillRecover') / N,
        h('HospitalFatal') / N,
        h('RecoveredMild') / N,
        h('RecoveredSevere') / N,
        h('Fatal') / N,
      ])

      day++
    }

    return goh_states
  }

  function getLastHistoricTime(demo_mode, P_all_fin, dt) {
    if (!P_all_fin || demo_mode === SHOW_FUTURE) return 0
    return get_every_nth(P_all_fin, dt).length
  }








  function fix_number_of_values(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too few values, augment with empty so that the Chart renders properly.
    while (augmented.length < 101*dt) {
      augmented.push([0,0,0,0,0])
    }
    // If we have too many values, take desired slice from the beginning.
    augmented = augmented.slice(0, 101*dt)
    // Log to console when this function is needed
    if (augmented.length !== P.length) {
      //console.log("Augm", P.length, "length to", augmented.length)
    }
    return augmented
  }

  function combine_historical_and_predictions(P_all_fin, P_all_goh) {
    // We need to remove first element from P_all_goh because the end historical state
    // is used as the start state for the predictions.
    return P_all_fin.concat(P_all_goh.slice(1))
  }

  function getPmax(P_bars, states) {
    var Pmax = 0
    for (var i=0; i<P_bars.length; i++) {
      const bars = P_bars[i]
      var curr = 0
      for (var j=0; j<states.length; j++) {
        const state = states[j]
        if (state['checked']) {
          const k = state['key']
          curr += P_bars[i][k]
        }
      }
      if (curr > Pmax) {
        Pmax = curr
      }
    }
    return Pmax
  }


  const SHOW_HISTORICAL = 0
  const SHOW_FUTURE = 1
  const SHOW_HISTORICAL_AND_FUTURE = 2


  /********************************** Generate state (choose which model to run, run it with user specified parameters, etc.) *********************************/

  function chooseP(demo_mode, P_all_fin, P_all_goh, dt) {
    var P_chosen = []
    const P_future = P_all_goh // TODO toggle between berkeley and goh here
    if (demo_mode === SHOW_HISTORICAL) P_chosen = P_all_fin
    if (demo_mode === SHOW_FUTURE) P_chosen = P_future
    if (demo_mode === SHOW_HISTORICAL_AND_FUTURE) P_chosen = combine_historical_and_predictions(P_all_fin, P_future)
    return fix_number_of_values(P_chosen, dt)
  }

  $: demo_mode       = SHOW_HISTORICAL_AND_FUTURE
  $: goh_states_fin  = loadFinnishHistoricalEstimates(finnishHistoricalEstimates, N)
  $: P_all_fin       = map_goh_states_into_chartV2_states(goh_states_fin, N, P_ICU)
  $: P_all_goh       = get_solution(demo_mode, goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR, InterventionTime, InterventionAmt, duration)
  $: P_all_berkeley  = map_berkeley_states_into_chartV2_states(berkeley_states, N)
  $: P_all           = chooseP(demo_mode, P_all_fin, P_all_goh, dt)
  $: P_bars          = get_every_nth(P_all, dt)
  $: timestep        = dt
  $: tmax            = dt*101
  $: Pmax            = getPmax(P_bars, stateMeta)
  $: lock            = false
  $: lastHistoricTime = getLastHistoricTime(demo_mode, P_all_fin, dt)






  /********************************** Info tooltip helper functions *********************************/

  function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
  }

  function formatCount(count) {
    // Counts are floats in Goh's model, so they need to be rounded.
    // Also formatting to string with space separators etc.
    return formatNumber(Math.round(count))
  }

  function formatDelta(delta) {
    return (delta >= 0 ? '+' : '') + formatCount(delta)
  }

  function formatPercent(proportion) {
    return (100 * proportion).toFixed(2)
  }

  function sumOfRoundedArrayValues(arr) {
    var s = 0
    var len = arr.length
    for (var i=0; i<len; i++) {
      s += Math.round(arr[i])
    }
    return s
  }
  
  function get_count_delta(k, bar) {
    const currCount = P_all[bar*dt][k]
    const prevCount = (bar > 0 ? P_all[bar*dt-1][k] : currCount)
    // We need to round intermediate values in order for delta to be consistent with rounded sigma values.
    // For example, if day1 sigma value is 100.6 and day day2 sigma value is 100.3, the delta needs to be 1,
    // because the user sees rounded values "101" and "100" and their delta should be 1, not 0.
    const delta = Math.round(currCount) - Math.round(prevCount)
    return delta
  }

  function getDay(bar) {
    return Math.round(indexToTime(bar))
  }

  function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function formatDate(date) {
    const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date)
    const month = new Intl.DateTimeFormat('en', { month: 'numeric' }).format(date)
    const day = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date)
    return `${day}.${month}.${year}`
  }

  function getDate(bar) {
    const days = getDay(bar)
    return formatDate(addDays(first_date, days))
  }

  function renderSigmaDelta(state, bar, P_all) {
    // Note: P_all is unused but it must exist to force Svelte to trigger a render
    const k = state["key"]
    return `<div class="legendtextnum"><span style="font-size:12px; padding-right:3px; color:#CCC">∑</span>
              <i>
                ${formatCount(P_bars[bar][k])} 
                (${formatPercent(P_bars[bar][k] / N)}%)
              </i>
            </div>
            <div class="legendtextnum"><span style="font-size:12px; padding-right:2px; color:#CCC">Δ</span>
              <i>
                ${formatDelta(get_count_delta(k, bar))} on day ${getDay(bar)}
              </i>
            </div>`
  }







  var Plock = 1

  var drag_y = function (){
    var dragstarty = 0
    var Pmaxstart = 0

    var dragstarted = function (d) {
      dragstarty = event.y  
      Pmaxstart  = Pmax
    }

    var dragged = function (d) {
      Pmax = Math.max( (Pmaxstart*(1 + (event.y - dragstarty)/500)), 10)
    }

    return drag().on("drag", dragged).on("start", dragstarted)
  }

  var drag_x = function (){
    var dragstartx = 0
    var dtstart = 0
    var Pmaxstart = 0
    var dragstarted = function (d) {
      dragstartx = event.x
      dtstart  = dt
      Plock = Pmax
      lock = true
    }
    var dragged = function (d) {
      dt = dtstart - 0.0015*(event.x - dragstartx)
    }
    var dragend = function (d) {
      lock = false
    }
    return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
  }

  var drag_intervention = function (){
    var dragstarty = 0
    var InterventionTimeStart = 0

    var dragstarted = function (d) {
      dragstarty = event.x  
      InterventionTimeStart = InterventionTime
      Plock = Pmax
      lock = true
    }


    var dragged = function (d) {
      // InterventionTime = Math.max( (*(1 + (event.x - dragstarty)/500)), 10)
      // console.log(event.x)
      const minX = (demo_mode === SHOW_FUTURE ? 0 : P_all_fin.length)
      InterventionTime = Math.min(tmax-1, Math.max(minX, InterventionTimeStart + xScaleTimeInv(event.x - dragstarty)))
    }

    var dragend = function (d) {
      lock = false
    }

    return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
  }


  var drag_intervention_end = function (){
    var dragstarty = 0
    var durationStart = 0

    var dragstarted = function (d) {
      dragstarty = event.x  
      durationStart = duration
      Plock = Pmax
      lock = true
    }

    var dragged = function (d) {
      // InterventionTime = Math.max( (*(1 + (event.x - dragstarty)/500)), 10)
      // console.log(event.x)
      const minX = (demo_mode === SHOW_FUTURE ? 0 : P_all_fin.length)
      duration = Math.min(tmax-1, Math.max(minX, durationStart + xScaleTimeInv(event.x - dragstarty)))
    }

    var dragend = function (d) {
      lock = false
    }

    return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
  }


  $: parsed = "";
  onMount(async () => {

    var drag_callback_y = drag_y()
    drag_callback_y(selectAll("#yAxisDrag"))

    if (allow_x_axis_resizing) {
      var drag_callback_x = drag_x()
      drag_callback_x(selectAll("#xAxisDrag"))
    }
    
    var drag_callback_intervention = drag_intervention()
    // drag_callback_intervention(selectAll("#interventionDrag"))
    drag_callback_intervention(selectAll("#dottedline"))
    // var drag_callback_intervention_end = drag_intervention_end()
    // drag_callback_intervention_end(selectAll("#dottedline2"))

    if (typeof window !== 'undefined') {
      parsed = queryString.parse(window.location.search)
      if (!(parsed.logN === undefined)) {logN = parsed.logN}
      if (!(parsed.I0 === undefined)) {I0 = parseFloat(parsed.I0)}
      if (!(parsed.R0 === undefined)) {R0 = parseFloat(parsed.R0)}
      if (!(parsed.D_incbation === undefined)) {D_incbation = parseFloat(parsed.D_incbation)}
      if (!(parsed.D_infectious === undefined)) {D_infectious = parseFloat(parsed.D_infectious)}
      if (!(parsed.D_recovery_mild === undefined)) {D_recovery_mild = parseFloat(parsed.D_recovery_mild)}
      if (!(parsed.D_recovery_severe === undefined)) {D_recovery_severe = parseFloat(parsed.D_recovery_severe)}
      if (!(parsed.CFR === undefined)) {CFR = parseFloat(parsed.CFR)}
      if (!(parsed.InterventionTime === undefined)) {InterventionTime = parseFloat(parsed.InterventionTime)}
      if (!(parsed.InterventionAmt === undefined)) {InterventionAmt = parseFloat(parsed.InterventionAmt)}
      if (!(parsed.D_hospital_lag === undefined)) {D_hospital_lag = parseFloat(parsed.D_hospital_lag)}
      if (!(parsed.P_SEVERE === undefined)) {P_SEVERE = parseFloat(parsed.P_SEVERE)}
      if (!(parsed.Time_to_death === undefined)) {Time_to_death = parseFloat(parsed.Time_to_death)}

    }
  });

  function lock_yaxis(){
    Plock = Pmax
    lock  = true
  }

  function unlock_yaxis(){
    lock = false
  }

  const padding = { top: 20, right: 0, bottom: 20, left: 25 };

  let width  = 750;
  let height = 400;

  $: xScaleTime = scaleLinear()
    .domain([0, tmax])
    .range([padding.left, width - padding.right]);

  $: xScaleTimeInv = scaleLinear()
    .domain([0, width])
    .range([0, tmax]);

  $: indexToTime = scaleLinear()
    .domain([0, P_bars.length])
    .range([0, tmax])

  window.addEventListener('mouseup', unlock_yaxis);

  $: active  = 0
  $: active_ = active >= 0 ? active : P_bars.length - 1

  var Tinc_s = "\\color{#CCC}{T^{-1}_{\\text{inc}}} "
  var Tinf_s = "\\color{#CCC}{T^{-1}_{\\text{inf}}}"
  var Rt_s   = "\\color{#CCC}{\\frac{\\mathcal{R}_{t}}{T_{\\text{inf}}}} "
  $: ode_eqn = katex.renderToString("\\frac{d S}{d t}=-" +Rt_s +"\\cdot IS,\\qquad \\frac{d E}{d t}=" +Rt_s +"\\cdot IS- " + Tinc_s + " E,\\qquad \\frac{d I}{d t}=" + Tinc_s + "E-" + Tinf_s+ "I, \\qquad \\frac{d R}{d t}=" + Tinf_s+ "I", {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
  });

  function math_inline(str) {
    return katex.renderToString(str, {
    throwOnError: false,
    displayMode: false,
    colorIsTextColor: true
    });
  }

  function math_display(str) {
    return katex.renderToString(str, {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
    });
  }
  
  $: p_num_ind = 40

  function get_milestones(P){

    function argmax(k) {
      var maxVal = 0
      var maxValIndex = 0
      for (var i=0; i<P.length; i++) {
        const val = P[i][k]
        if (val > maxVal) {
          maxVal = val
          maxValIndex = i
        }
      }
      return maxValIndex
    }

    var milestones = []
    for (var i = 0; i < P.length; i++) {
      if (P[i][K_FATALITIES] >= 0.5) {
        milestones.push([i*dt, "First death"])
        break
      }
    }

    var i = argmax(K_HOSPITALIZED)
    milestones.push([i*dt, "Peak: " + format(",")(Math.round(P[i][K_HOSPITALIZED])) + " hospitalizations"])
    return milestones
  }

  $: milestones = get_milestones(P_bars)
  $: log = true

</script>

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.11.1/dist/katex.css" integrity="sha384-bsHo4/LA+lkZv61JspMDQB9QP1TtO4IgOf2yYS+J6VdAYLVyx1c3XKcsHh0Vy8Ws" crossorigin="anonymous">

<style>
  .small { font: italic 6px Source Code Pro; }
  @import url('https://fonts.googleapis.com/css?family=Source+Code+Pro&display=swap');

  :global(html) {
      overflow-y: scroll;
  }

  h2 {
    margin: auto;
    width: 950px;
    font-size: 40px;
    padding-top: 20px;
    padding-bottom: 0px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
  }

  h5 {
    margin: auto;
    margin-top: 0;
    width: 950px;
    font-size: 16px;
    padding-left: 40px;
    padding-bottom: 20px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-style: italic;
    padding-bottom: 30px
  }

  .center {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    color:#666;
    font-size: 16.5px;
    text-align: justify;
    line-height: 24px
  }

  .ack {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    color:#333;
    font-size: 13px;
  }

  .row {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    margin: auto;
    display: flex;
    width: 948px;
    font-size: 13px;
  }

  .caption {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-size: 13px;    
  }

  .column {
    flex: 158px;
    padding: 0px 5px 5px 0px;
    margin: 0px 5px 5px 5px;
    /*border-top: 2px solid #999*/
  }

  .minorTitle {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    margin: auto;
    display: flex;
    width: 950px;
    font-size: 17px;
    color: #666;
  }

  .minorTitleColumn{
    flex: 60px;
    padding: 3px;
    border-bottom: 2px solid #999;
  }


  .paneltext{
    position:relative;
    height:130px;
  }

  .paneltitle{
    color:#777; 
    line-height: 17px; 
    padding-bottom: 4px;
    font-weight: 700;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
  }

  .paneldesc{
    color:#888; 
    text-align: left;
    font-weight: 300;
  }

  .slidertext{
    color:#555; 
    line-height: 7px; 
    padding-bottom: 0px; 
    padding-top: 7px;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-family: 'Source Code Pro', monospace;
    font-size: 10px;
    text-align: right;
    /*font-weight: bold*/
  }
    
  .range {
    width: 100%;
  }

  .chart {
    width: 100%;
    margin: 0 auto;
    padding-top:0px;
    padding-bottom:10px;
  }

  .legend {
    color: #888;
    font-family: Helvetica, Arial;
    font-size: .725em;
    font-weight: 200;
    height: 100px;
    left: 20px;
    top: 4px;
    position: absolute;
  }

  .legendtitle {
    color:#777; 
    font-size:13px;
    padding-bottom: 6px;
    font-weight: 600;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
  }


  .legendtext{
    color:#888; 
    font-size:13px;
    padding-bottom: 5px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    line-height: 14px;
  }

  .legendtextnum{
    color:#888; 
    font-size:13px;
    padding-bottom: 5px;
    font-weight: 300;
    line-height: 12px;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    left: -3px;
    position: relative;
  }

  .tick {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    font-size: .725em;
    font-weight: 200;
    font-size: 13px
  }

  td { 
    text-align: left;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    border-bottom: 1px solid #DDD;
    border-collapse: collapse;
    padding: 3px;
    /*font-size: 14px;*/
  }

  tr {
    border-collapse: collapse;
    border-spacing: 15px;
  }

  .eqn {
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    margin: auto;
    display: flex;
    flex-flow: row wrap;
    width: 950px;
    column-count: 4;
    font-weight: 300;
    color:#666;
    font-size: 16.5px;
  }

  th { font-weight: 500; text-align: left; padding-bottom: 5px; vertical-align: text-top;     border-bottom: 1px solid #DDD; }

  a:link { color: grey; }
  a:visited { color: grey; }

</style>

<h2>Corosim</h2>
<h5>Historical Estimates & Future Modelling of Coronavirus in Finland</h5>

<div class="chart" style="display: flex; max-width: 1120px">

  <div style="flex: 0 0 270px; width:270px;">
    <div style="position:relative; top:48px; right:-115px">
      <div class="legendtext" style="position:absolute; left:-70px; top:-50px; width:150px; height: 100px; font-size: 13px; line-height:16px; font-weight: normal; text-align: center">
        <b>Highlighted day:</b>
        <br>Day {getDay(active_)}
        <br>{getDate(active_)}
      </div>

      <!-- Tooltip states -->
      {#each stateMeta as state,i}
        {#if state["checkable"]}
          <div style="position:absolute; left:0px; top:{legendheight*(i-1)}px; width: 180px; height: 100px">
            <Arrow height="43" arrowhead="" dasharray="3 2"/>
            <Checkbox color="{state['color']}" bind:checked={state['checked']} />
            <div class="legend" style="position:absolute;">
              <div class="legendtitle">
                {state["tooltip_title"]}
              </div>
              <div style="padding-top: 3px; padding-bottom: 1px">
                {@html renderSigmaDelta(state, active_, P_all)}
              </div>
            </div>
            <div class="legendtext" style="text-align: right; width:105px; left:-111px; top: 4px; position:relative;">
              {state["tooltip_desc"]}
            </div>
          </div>
        {/if}
      {/each}

    </div>
  </div>

  <div style="flex: 0 0 890px; width:890px; height: {height+128}px; position:relative;">

    <div style="position:relative; top:60px; left: 10px">
      <Chart
        bind:active={active}
        states = {P_bars} 
        stateMeta = {stateMeta}
        xmax = {Xmax}
        timestep={timestep}
        tmax={tmax}
        N={N}
        ymax={lock ? Plock: Pmax}
        InterventionTime={InterventionTime}
        lastHistoricTime={lastHistoricTime}
        log={!log}
        />
    </div>

      {#if allow_x_axis_resizing}
        <div id="xAxisDrag"
           style="{allow_x_axis_resizing ? "cursor:col-resize;" : ""}
                  pointer-events: all;
                  position: absolute;
                  top:{height+80}px;
                  left:{0}px;
                  width:{780}px;
                  background-color:#222;
                  opacity: 0;
                  height:25px;">
        </div>
      {/if}

      <div id="yAxisDrag"
           style="cursor:row-resize;
                  pointer-events: all;
                  position: absolute;
                  top:{55}px;
                  left:{0}px;
                  width:{20}px;
                  background-color:#222;
                  opacity: 0;
                  height:425px;">
      </div>

      <!-- Intervention Line -->
      <div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:100px; left:10px; pointer-events: none">
        <div id="dottedline"  style="pointer-events: all;
                    position: absolute;
                    top:-38px;
                    left:{xScaleTime(InterventionTime)}px;
                    visibility: {(xScaleTime(InterventionTime) < (width - padding.right)) ? 'visible':'hidden'};
                    width:2px;
                    background-color:#FFF;
                    border-right: 1px dashed black;
                    pointer-events: all;
                    cursor:col-resize;
                    height:{height+19}px">

        <div style="position:absolute; opacity: 0.5; top:-5px; left:10px; width: 120px">
        <span style="font-size: 13px">{@html math_inline("\\mathcal{R}_t=" + (R0*InterventionAmt).toFixed(2) )}</span> ⟶ 
        </div>

        {#if xScaleTime(InterventionTime) >= 100}
          <div style="position:absolute; opacity: 0.5; top:-5px; left:-97px; width: 120px">
          <span style="font-size: 13px">⟵ {@html math_inline("\\mathcal{R}_0=" + (R0).toFixed(2) )}</span>
          </div>      
        {/if}

        <div id="interventionDrag" class="legendtext" style="flex: 0 0 160px; width:120px; position:relative;  top:-70px; height: 60px; padding-right: 15px; left: -125px; pointer-events: all;cursor:col-resize;" >
          <div class="paneltitle" style="top:9px; position: relative; text-align: right">Action on day {format("d")(InterventionTime)}</div>
          <span></span><div style="top:9px; position: relative; text-align: right">
          <!-- (drag me) --> </div>
          <!--
          <div style="top:43px; left:40px; position: absolute; text-align: right; width: 20px; height:20px; opacity: 0.3">
            <svg width="20" height="20">
              <g transform="rotate(90)">
                <g transform="translate(0,-20)">
                  <path d="M2 11h16v2H2zm0-4h16v2H2zm8 11l3-3H7l3 3zm0-16L7 5h6l-3-3z"/>
                 </g>  
              </g>
            </svg>
          </div>
          -->
        </div>


        <div style="width:150px; position:relative; top:-85px; height: 80px; padding-right: 15px; left: 0px; ;cursor:col-resize; background-color: white; position:absolute" >

        </div>


        </div>
      </div>

      <!-- Intervention Line slider -->
      <div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:120px; left:10px; pointer-events: none">
        <div style="
            position: absolute;
            top:-38px;
            left:{xScaleTime(InterventionTime)}px;
            visibility: {(xScaleTime(InterventionTime) < (width - padding.right)) ? 'visible':'hidden'};
            width:2px;
            background-color:#FFF;
            border-right: 1px dashed black;
            cursor:col-resize;
            height:{height}px">
            <div style="flex: 0 0 160px; width:200px; position:relative; top:-125px; left: 1px" >
              <div class="caption" style="pointer-events: none; position: absolute; left:0; top:40px; width:150px; border-left: 2px solid #777; padding: 5px 7px 7px 7px; ">      
              <div class="paneltext" style="height:20px; text-align: right">
              <div class="paneldesc">to alter transmission by<br></div>
              </div>
              <div style="pointer-events: all">
              <div class="slidertext" on:mousedown={lock_yaxis}>{formatDelta(-100*(1-InterventionAmt))}%</div>
              <input class="range" type=range bind:value={OMInterventionAmt} min=-1 max=1 step=0.01 on:mousedown={lock_yaxis}>
              </div>
              </div>
            </div>
          </div>
      </div>

      <div style="pointer-events: none;
                  position: absolute;
                  top:{height+84}px;
                  left:{0}px;
                  width:{780}px;
                  opacity: 1.0;
                  height:25px;
                  cursor:col-resize">
            {#each milestones as milestone}
              <div style="position:absolute; left: {xScaleTime(milestone[0])+8}px; top: -30px;">
                <span style="opacity: 0.3"><Arrow height=30 arrowhead="#circle" dasharray = "2 1"/></span>
                  <div class="tick" style="position: relative; left: 0px; top: 35px; max-width: 130px; color: #BBB; background-color: white; padding-left: 4px; padding-right: 4px">{@html milestone[1]}</div>
              </div>
            {/each}
      </div>
    
    <!-- Log scale does not work even in the original Epidemic Calculator, so hide this button that toggles it. -->
    <!--
    <div style="opacity:{xScaleTime(InterventionTime) >= 192? 1.0 : 0.2}">
      <div class="tick" style="color: #AAA; position:absolute; pointer-events:all; left:10px; top: 10px">
        <Checkbox color="#CCC" bind:checked={log}/><div style="position: relative; top: 4px; left:20px">linear scale</div>
      </div>
    </div>
    -->

   </div>

</div>


<div style="height:220px;">
  <div class="minorTitle">
    <div style="margin: 0px 0px 5px 4px" class="minorTitleColumn">Transmission Dynamics</div>
    <div style="flex: 0 0 20; width:20px"></div>
    <div style="margin: 0px 4px 5px 0px" class="minorTitleColumn">Clinical Dynamics</div>
  </div>
  <div class = "row">

    <div class="column">
      <div class="paneltitle">Proto Config</div>

      <div class="paneldesc" style="height:30px">Demo mode<br></div>
      <div class="slidertext">{demo_mode === SHOW_FUTURE ? 'Future' : (demo_mode === SHOW_HISTORICAL ? 'History' : 'History+Future')}</div>
      <input class="range" style="margin-bottom: 8px"type=range bind:value={demo_mode} min=0 max=2 step=1>

      <div class="paneldesc" style="height:30px; border-top: 0px solid #EEE;">Zoom x-axis<br></div> 
      <div class="slidertext">1/{dt}</div>
      <input class="range" type=range bind:value={dt} min=1 max=4 step=1>


    </div>

    <div class="column">
      <div class="paneltext">
      <div class="paneltitle">Basic Reproduction Number {@html math_inline("\\mathcal{R}_0")} </div>
      <div class="paneldesc">Measure of contagiousness: the number of secondary infections each infected individual produces. <br></div>
      </div>
      <div class="slidertext">{R0}</div>
      <input class="range" type=range bind:value={R0} min=0.01 max=10 step=0.01> 
    </div> 

    <div class="column">
      <div class="paneltitle">Transmission Times</div>
      <div class="paneldesc" style="height:30px">Length of incubation period, {@html math_inline("T_{\\text{inc}}")}.<br></div>
      <div class="slidertext">{(D_incbation).toFixed(2)} days</div>
      <input class="range" style="margin-bottom: 8px"type=range bind:value={D_incbation} min={0.15} max=24 step=0.0001>
      <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">Duration patient is infectious, {@html math_inline("T_{\\text{inf}}")}.<br></div>
      <div class="slidertext">{D_infectious} Days</div>
      <input class="range" type=range bind:value={D_infectious} min={0} max=24 step=0.01>
    </div>

    <div style="flex: 0 0 20; width:20px"></div>

    <div class="column">
      <div class="paneltitle">Mortality Statistics</div>
      <div class="paneldesc" style="height:30px">Case fatality rate.<br></div>
      <div class="slidertext">{(CFR*100).toFixed(2)} %</div>
      <input class="range" style="margin-bottom: 8px" type=range bind:value={CFR} min={0} max=1 step=0.0001>
      <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">Time from end of incubation to death.<br></div>
      <div class="slidertext">{Time_to_death} Days</div>
      <input class="range" type=range bind:value={Time_to_death} min={(D_infectious)+0.1} max=100 step=0.01>
    </div>

    <div class="column">
      <div class="paneltitle">Recovery Times</div>
      <div class="paneldesc" style="height:30px">Length of hospital stay<br></div>
      <div class="slidertext">{D_recovery_severe} Days</div>
      <input class="range" style="margin-bottom: 8px" type=range bind:value={D_recovery_severe} min={0.1} max=100 step=0.01>
      <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">Recovery time for mild cases<br></div>
      <div class="slidertext">{D_recovery_mild} Days</div>
      <input class="range" type=range bind:value={D_recovery_mild} min={0.5} max=100 step=0.01>
    </div>

    <div class="column">
      <div class="paneltitle">Care statistics</div>
      <div class="paneldesc" style="height:30px">Hospitalization rate.<br></div>
      <div class="slidertext">{(P_SEVERE*100).toFixed(2)} %</div>
      <input class="range" style="margin-bottom: 8px"type=range bind:value={P_SEVERE} min={0} max=1 step=0.0001>      
      <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">Time to hospitalization.<br></div>
      <div class="slidertext">{D_hospital_lag} Days</div>
      <input class="range" type=range bind:value={D_hospital_lag} min={0.5} max=100 step=0.01>
    </div>

  </div>
</div>

<div style="position: relative; height: 12px"></div>


<!--
<p class = "center">
This is a fork of Gabriel Goh's fantastic Epidemic Calculator. The text below is by Gabriel Goh.
</p>

<hr/>
<p></p>

<p class = "center">
At the time of writing, the coronavirus disease of 2019 remains a global health crisis of grave and uncertain magnitude. To the non-expert (such as myself), contextualizing the numbers, forecasts and epidemiological parameters described in the media and literature can be challenging. I created this calculator as an attempt to address this gap in understanding.
</p>

<p class = "center">
This calculator implements a classical infectious disease model &mdash <b><a href="https://en.wikipedia.org/wiki/Compartmental_models_in_epidemiology#The_SEIR_model">SEIR</a> </b>(<b>S</b>usceptible → <span style="color:{colors[4]}"><b>E</b></span>xposed → <span style="color:{colors[3]}"><b>I</b></span>nfected → <span><b>R</b></span>emoved), an idealized model of spread still used in frontlines of research e.g. [<a href="https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(20)30260-9/fulltext">Wu, et. al</a>, <a href = "https://cmmid.github.io/topics/covid19/current-patterns-transmission/wuhan-early-dynamics.html">Kucharski et. al</a>]. The dynamics of this model are characterized by a set of four ordinary differential equations that correspond to the stages of the disease's progression:
<span style="color:#777">{@html ode_eqn}</span>
In addition to the transmission dynamics, this model allows the use of supplemental timing information to model the death rate and healthcare burden. 
</p>

<p class = "center">
Note that one can use this calculator to measure one's risk exposure to the disease for any given day of the epidemic: the probability of getting infected on day {Math.round(indexToTime(active_))} given <a href="https://www.cdc.gov/coronavirus/2019-ncov/hcp/guidance-risk-assesment-hcp.html">close contact</a> with <input type="text" style="width:{Math.ceil(Math.log10(p_num_ind))*9.5 + 5}px; font-size: 15.5px; color:#777" bind:value={p_num_ind}> individuals is {((1-(Math.pow(1 - (Iters[active_][2])*(0.45/100), p_num_ind)))*100).toFixed(5)}% given an attack rate of 0.45% [<a href="https://www.cdc.gov/mmwr/volumes/69/wr/mm6909e1.htm?s_cid=mm6909e1_w">Burke et. al</a>].
</p>


<p class = "center">
A sampling of the estimates for epidemic parameters are presented below:
</p>

<div class="center">
<table style="width:100%; margin:auto; font-weight: 300; border-spacing: inherit">
  <tr>
    <th></th>
    <th>Location</th>
    <th>Reproduction Number<br> {@html math_inline("\\mathcal{R}_0")}</th>
    <th>Incubation Period<br> {@html math_inline("T_{\\text{inc}}")} (in days)</th>
    <th>Infectious Period<br> {@html math_inline("T_{\\text{inf}}")} (in days)</th>
  </tr>
  <tr>
    <td width="27%"><a href = "https://cmmid.github.io/topics/covid19/current-patterns-transmission/wuhan-early-dynamics.html">Kucharski et. al</a></td>
    <td>Wuhan </td>    
    <td>3.0 (1.5 — 4.5)</td>
    <td>5.2</td>
    <td>2.9</td>
  </tr>
  <tr>
    <td><a href = "https://www.nejm.org/doi/full/10.1056/NEJMoa2001316">Li, Leung and Leung</a></td>
    <td>Wuhan </td>    
    <td>2.2 (1.4 — 3.9)</td>
    <td>5.2 (4.1 — 7.0)</td>
    <td>2.3 (0.0 — 14.9)</td>
  </tr>
  <tr>
    <td><a href = "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(20)30260-9/fulltext">Wu et. al</a></td>
    <td>Greater Wuhan </td>    
    <td>2.68 (2.47 — 2.86)</td>
    <td>6.1</td>
    <td>2.3</td>
  </tr>
  <tr>
    <td><a href = "https://www.who.int/news-room/detail/23-01-2020-statement-on-the-meeting-of-the-international-health-regulations-(2005)-emergency-committee-regarding-the-outbreak-of-novel-coronavirus-(2019-ncov)">WHO Initial Estimate</a></td>
    <td>Hubei </td>    
    <td>1.95 (1.4 — 2.5)</td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><a href = "https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf">WHO-China Joint Mission </a></td>
    <td>Hubei </td>    
    <td>2.25 (2.0 — 2.5)</td>
    <td>5.5 (5.0 - 6.0)</td>
    <td></td>
  </tr>
  <tr>
    <td><a href = "https://www.biorxiv.org/content/10.1101/2020.01.25.919787v2">Liu et. al </a></td>
    <td>Guangdong</td>
    <td>4.5 (4.4 — 4.6)</td>
    <td>4.8 (2.2 — 7.4) </td>
    <td>2.9 (0 — 5.9)</td>
  </tr>
  <tr>
    <td><a href = "https://academic.oup.com/jtm/advance-article/doi/10.1093/jtm/taaa030/5766334">Rocklöv, Sjödin and Wilder-Smith</a></td>
    <td>Princess Diamond</td>
    <td>14.8</td>
    <td>5.0</td>
    <td>10.0</td>
  </tr>
  <tr>
    <td><a href = "https://www.eurosurveillance.org/content/10.2807/1560-7917.ES.2020.25.5.2000062">Backer, Klinkenberg, Wallinga</a></td>
    <td>Wuhan</td>
    <td></td>
    <td>6.5 (5.6 — 7.9)</td>
    <td></td>
  </tr>
  <tr>
    <td><a href = "https://www.medrxiv.org/content/10.1101/2020.01.23.20018549v2.article-info">Read et. al</a></td>
    <td>Wuhan</td>
    <td>3.11 (2.39 — 4.13)</td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><a href = "https://www.medrxiv.org/content/10.1101/2020.03.03.20028423v1">Bi et. al</a></td>
    <td>Shenzhen</td>
    <td></td>
    <td>4.8 (4.2 — 5.4)</td>
    <td>1.5 (0 — 3.4)</td>
    <td></td>
  </tr>

  <tr>
    <td><a href = "https://www.mdpi.com/2077-0383/9/2/462">Tang et. al</a></td>
    <td>China</td>
    <td>6.47 (5.71 — 7.23)</td>
    <td></td>
    <td></td>
  </tr>

</table>
</div>


<p class="center">
See [<a href="https://academic.oup.com/jtm/advance-article/doi/10.1093/jtm/taaa021/5735319">Liu et. al</a>] detailed survey of current estimates of the reproduction number. Parameters for the diseases' clinical characteristics are taken from the following <a href="https://www.who.int/docs/default-source/coronaviruse/who-china-joint-mission-on-covid-19-final-report.pdf">WHO Report</a>. 
</p>

<p class="center">
Please DM me feedback <a href="https://twitter.com/gabeeegoooh">here</a> or email me <a href="mailto:izmegabe@gmail.com">here</a>. My <a href="http://gabgoh.github.io/">website</a>.
</p>



<p class = "center">
<b> Model Details </b><br>
The clinical dynamics in this model are an elaboration on SEIR that simulates the disease's progression at a higher resolution, subdividing {@html math_inline("I,R")} into <i>mild</i> (patients who recover without the need for hospitalization), <i>moderate</i> (patients who require hospitalization but survive) and <i>fatal</i> (patients who require hospitalization and do not survive). Each of these variables follows its own trajectory to the final outcome, and the sum of these compartments add up to the values predicted by SEIR. Please refer to the source code for details. Note that we assume, for simplicity, that all fatalities come from hospitals, and that all fatal cases are admitted to hospitals immediately after the infectious period.
</p>

<p class = "center">
<b> Acknowledgements </b><br>
<a href = "https://enkimute.github.io/">Steven De Keninck</a> for RK4 Integrator. <a href="https://twitter.com/ch402">Chris Olah</a>, <a href="https://twitter.com/shancarter">Shan Carter
</a> and <a href="https://twitter.com/ludwigschubert">Ludwig Schubert
</a> wonderful feedback. <a href="https://twitter.com/NikitaJer">Nikita Jerschov</a> for improving clarity of text. Charie Huang for context and discussion.
</p>
-->

<!-- Input data -->
<!-- <div style="margin-bottom: 30px">

  <div class="center" style="padding: 10px; margin-top: 3px; width: 925px">
    <div class="legendtext">Export parameters:</div>
    <form>
      <textarea type="textarea" rows="1" cols="5000" style="white-space: nowrap;  overflow: auto; width:100%; text-align: left" id="fname" name="fname">{state}</textarea>
    </form>
  </div>
</div>
-->
