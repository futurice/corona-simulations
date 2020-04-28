<script>
  
  import { scaleLinear } from "d3-scale";
  // import { Date } from "d3-time"
  import Chart from './components/Chart.svelte';
  import ChartCompanion from './components/ChartCompanion.svelte';
  import { onMount } from 'svelte';
  import { selectAll } from 'd3-selection'
  import { drag } from 'd3-drag';
  import queryString from "query-string";
  import ActionMarker from './components/ActionMarker.svelte';
  import { ActionMarkerData, AM_DAY } from './action_marker_data.js';
  import Checkbox from './components/Checkbox.svelte';
  import Arrow from './components/Arrow.svelte';
  import { format } from 'd3-format';
  import { event } from 'd3-selection';
  import Icon from 'svelte-awesome';
  import { search, plus } from 'svelte-awesome/icons';

  import defaultParameters from '../default_parameters.js';
  import { UFState, getDefaultStateMeta } from './user_facing_states.js';
  import { get_solution_from_gohs_seir_ode, map_goh_states_into_UFStates, goh_default_action_markers } from './models/gohs_seir_ode.js';
  import { map_berkeley_states_into_UFStates, temphack, get_berkeley_action_markers } from './models/berkeley_abm.js';
  import { loadFinnishHistoricalEstimates } from './models/historical_estimates.js';
  import { addDays,
           formatCount, formatDelta,
           SHOW_HISTORICAL, SHOW_FUTURE, SHOW_HISTORICAL_AND_FUTURE,
           MODEL_GOH, MODEL_BERKELEY, MODEL_REINA, MODEL_CUSTOM,
         } from './utils.js';

  import katex from 'katex';
  import { math_inline, math_display, padding } from './utils.js';

  import finnishCoronaData from './../data/finnishCoronaData.json';
  import berkeley_states from './../data/berkeley6_states.json';
  import berkeley_params from './../data/berkeley6_params.json'; 
  import finnishHistoricalEstimates from './../data/hardcodedHistoricalEstimates.csv';





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

  let allow_x_axis_resizing = false // x axis "drag resizing" was replaced by magnifying glass toggle
  let custom_scenario_url_prefix = 'https://coronastoragemyvs.blob.core.windows.net/coviducb/'
  //let custom_scenario_url_prefix = 'http://localhost:5000/'
  let custom_scenario_url_postfix = '-outcome_1.json'

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
  $: Time              = 220
  $: Xmax              = 110000
  $: dt                = 2
  $: P_SEVERE          = defaultParameters["hospitalization_rate"]
  $: P_ICU             = defaultParameters["icu_rate_from_hospitalized"]
  $: icuCapacity       = defaultParameters["icu_capacity"]

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
               "D_hospital_lag":D_hospital_lag,
               "P_SEVERE": P_SEVERE})

  function toggleZoomStates() {
    dt = (dt % 4) + 1
  }

  function addActionMarker() {
    actionMarkers[selectedModel].push(new ActionMarkerData(99*dt, undefined, -0.1, true))
    actionMarkers = actionMarkers // Trigger re-render
  }

  function getLastHistoricTime(demo_mode, P_all_historical, dt) {
    if (!P_all_historical || demo_mode === SHOW_FUTURE) return 0
    return get_every_nth(P_all_historical, dt).length - 1 // TODO optimize this to be more efficient
  }

  function with_enough_days(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too few values, augment with empty so that the Chart renders properly.
    while (augmented.length < 101*dt) {
      augmented.push([0,0,0,0,0])
    }
    return augmented
  }

  function take_slice_from_beginning(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too many values, take desired slice from the beginning.
    augmented = augmented.slice(0, 101*dt)
    return augmented
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





  /********************************** Generate state (choose which model to run, run it with user specified parameters, etc.) *********************************/

  function chooseP(demo_mode, P_all_historical, P_all_future) {
    var P_chosen = []
    if (demo_mode === SHOW_HISTORICAL) P_chosen = P_all_historical
    if (demo_mode === SHOW_FUTURE) P_chosen = P_all_future
    if (demo_mode === SHOW_HISTORICAL_AND_FUTURE) P_chosen = P_all_historical.concat(P_all_future)
    return P_chosen
  }

  function debugHelper([... vars]) {
    if (vars.length == 0) return
    console.log('*** DEBUG ***')
    for (var i=0; i<vars.length; i++) {
      console.log(vars[i])
    }
  }

  function fetchCustomScenarioAsync() {
    customScenarioStatus = 'Fetching data...'
    const url = custom_scenario_url_prefix + customScenarioGUID + custom_scenario_url_postfix
    fetch(url, { 
      method: 'GET'
    })
    .then((response) => {
      if (!response.ok) {
        showUserError(response)
      }
      return response
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      parseCustomScenario(json)
    })
    .catch(error => {
      showUserError(error)
    });
  }

  let customScenarioStatus = ''

  function showUserError(thing) {
    customScenarioStatus = 'Error fetching scenario'
    console.log(thing)
  }

  function parseCustomScenario(json) {
    customScenarioStatus = '' // Clear out "Fetching..." message
    P_all_fetched = temphack(json["scenario_states"], json["scenario_params"], N)
    actionMarkers[MODEL_CUSTOM] = get_berkeley_action_markers(P_all_historical.length, json["scenario_params"])
    custom_params = {...json["scenario_params"], ...json["parameters"]}
  }

  function get_solution(demo_mode, selectedModel, P_all_fetched, actionMarkers, goh_states_fin, berkeley_states, berkeley_params, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR) {
    if (selectedModel === MODEL_GOH) {
      return get_solution_from_gohs_seir_ode(demo_mode, actionMarkers[selectedModel], goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital_lag, D_recovery_severe, D_death, P_SEVERE, P_ICU, CFR)
    } else if (selectedModel === MODEL_BERKELEY) {
      return temphack(berkeley_states, berkeley_params, N)
    } else if (selectedModel === MODEL_CUSTOM) {
      return P_all_fetched
    } else {
      console.log('Error! getSolution does not have handling for model ', selectedModel)
    }
  }

  function actionMarkerHelper(P_all_historical) {
    const m = actionMarkers || {}
    if (!m[MODEL_GOH]) m[MODEL_GOH] = goh_default_action_markers()
    m[MODEL_BERKELEY] = get_berkeley_action_markers(P_all_historical.length, berkeley_params)
    m[MODEL_REINA] = []
    if (!m[MODEL_CUSTOM]) m[MODEL_CUSTOM] = []
    return m
  }
  
  let customScenarioGUID   = queryString.parse(location.search).customScenario
  let P_all_fetched   = [] // For "Custom scenario": empty array until we get data.
  let custom_params   = {} // Empty "parameters object" as placeholder until we get data.

  $: selectedModel    = customScenarioGUID ? MODEL_CUSTOM : MODEL_GOH
  $: selectedParams   = selectedModel === MODEL_BERKELEY ? berkeley_params : custom_params
  $: showHistory      = true
  $: demo_mode        = showHistory ? SHOW_HISTORICAL_AND_FUTURE : SHOW_FUTURE
  $: [firstHistoricalDate,
      goh_states_fin] = loadFinnishHistoricalEstimates(finnishHistoricalEstimates, N)
  $: firstBarDate     = showHistory ? firstHistoricalDate : addDays(firstHistoricalDate, goh_states_fin.length - 1)
  $: P_all_historical = map_goh_states_into_UFStates(goh_states_fin, N, P_ICU)
  $: actionMarkers    = actionMarkerHelper(P_all_historical)
  $: stateMeta        = getDefaultStateMeta()
  $: P_all_future     = get_solution(
                          demo_mode,
                          selectedModel,
                          P_all_fetched,
                          actionMarkers,
                          goh_states_fin,
                          berkeley_states,
                          berkeley_params,
                          dt,
                          N,
                          I0,
                          R0,
                          D_incbation,
                          D_infectious,
                          D_recovery_mild,
                          D_hospital_lag,
                          D_recovery_severe,
                          D_death, P_SEVERE,
                          P_ICU,
                          CFR
                        )
  $: P_all            = with_enough_days(chooseP(demo_mode, P_all_historical, P_all_future, dt), dt)
  $: P_bars           = get_every_nth(take_slice_from_beginning(P_all, dt), dt)
  $: timestep         = dt
  $: tmax             = dt*101
  $: Pmax             = getPmax(P_bars, stateMeta)
  $: lock             = false
  $: lastHistoricTime = getLastHistoricTime(demo_mode, P_all_historical, dt)
  $: debugHelp        = debugHelper([])



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

  $: parsed = "";
  onMount(async () => {

    if (customScenarioGUID) {
      fetchCustomScenarioAsync()
    }

    var drag_callback_y = drag_y()
    drag_callback_y(selectAll("#yAxisDrag"))

    if (allow_x_axis_resizing) {
      var drag_callback_x = drag_x()
      drag_callback_x(selectAll("#xAxisDrag"))
    }

    // TODO what is this? Is it for "share your model" links?
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

  function activeHelper(active, demo_mode, P_all_historical, dt, lastHistoricTime) {
    if (active >= 0) {
      // Case: User hovers over a bar or has locked a bar.
      return active
    }
    if (demo_mode === SHOW_FUTURE) {
      // Case: Historical data is not shown, default to showing first predicted bar.
      return 0
    }
    return lastHistoricTime
  }

  $: active  = 0
  $: active_ = activeHelper(active, demo_mode, P_all_historical, dt, lastHistoricTime)

  var Tinc_s = "\\color{#CCC}{T^{-1}_{\\text{inc}}} "
  var Tinf_s = "\\color{#CCC}{T^{-1}_{\\text{inf}}}"
  var Rt_s   = "\\color{#CCC}{\\frac{\\mathcal{R}_{t}}{T_{\\text{inf}}}} "
  $: ode_eqn = katex.renderToString("\\frac{d S}{d t}=-" +Rt_s +"\\cdot IS,\\qquad \\frac{d E}{d t}=" +Rt_s +"\\cdot IS- " + Tinc_s + " E,\\qquad \\frac{d I}{d t}=" + Tinc_s + "E-" + Tinf_s+ "I, \\qquad \\frac{d R}{d t}=" + Tinf_s+ "I", {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
  });
  
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
      if (P[i]['fatalities'] >= 0.5) {
        if (i == 0) {
          // If first death occurs on first day, the initial conditions for the visualization
          // are in the middle of the epidemic. In that case we don't want to draw this milestone.
          break
        }
        milestones.push([i, "First death"])
        break
      }
    }

    var bar_peak_hosp = argmax('hospitalized')
    if (bar_peak_hosp < 100*dt) {
      // If peak hospitalization occurs on last day of zoomed in area, there is likely a higher peak beyond the visible area.
      // In that case we don't want to draw this milestone.
      milestones.push([bar_peak_hosp, "Peak: " + format(",")(Math.round(P[bar_peak_hosp]['hospitalized'])) + " hospitalizations"])
    }
    return milestones
  }

  $: milestones = get_milestones(P_all)
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

  /* TODO should be moved to global.css because this is copypasted into 3 components. */
  .legendtext{
    color:#888; 
    font-size:13px;
    padding-bottom: 5px;
    font-weight: 300;
    font-family: nyt-franklin,helvetica,arial,sans-serif;
    line-height: 14px;
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

  :global(.clickableIcons:hover) {
    color: #777 !important;
  }

  th { font-weight: 500; text-align: left; padding-bottom: 5px; vertical-align: text-top;     border-bottom: 1px solid #DDD; }

  a:link { color: grey; }
  a:visited { color: grey; }

</style>

<h2>Corosim</h2>
<h5>Historical Estimates & Future Predictions — Modelling COVID-19 in Finland</h5>

<div class="chart" style="display: flex; max-width: 1120px">
  <div style="flex: 0 0 270px; width:270px;">
    <div style="height: 50px;">
      
      <div class="legendtext" style="font-size: 14px; line-height:16px; font-weight: bold; color: #777;">
        Select scenario and model:
      </div>
      <select id="model-selection" bind:value={selectedModel}>
        <option value={MODEL_GOH} >Finland | Goh's SEIR ODE (live)</option>
        <option value={MODEL_BERKELEY} >Finland | Berkeley ABM (precomputed)</option>
        <option value={MODEL_REINA} disabled >Uusimaa | REINA ABM (precomputed)</option>
        <option value={MODEL_CUSTOM} disabled={customScenarioGUID ? false : true} >Custom scenario (precomputed)</option>
      </select>

      <div style="position: font-family: nyt-franklin,helvetica,arial,sans-serif; font-size: 13px; margin-bottom: 10px; margin-top: 10px; margin-left: 2px;">
        <div class="tick" style="position: relative; color: #AAA; pointer-events:all;">
          <Checkbox color="#BBB" bind:checked={showHistory}/><div style="position: relative; top: 4px; left:20px; color: #777;">Display historical estimates</div>
        </div>
      </div>

    </div>

    <div style="position:relative; top:100px; right:-115px">
      <ChartCompanion bind:stateMeta = {stateMeta}
        N = {N}
        dt = {dt}
        P_all = {P_all}
        P_bars = {P_bars}
        active_ = {active_}
        indexToTime = {indexToTime}
        firstBarDate = {firstBarDate}
      />

    </div>
  </div>

  <div style="flex: 0 0 890px; width:890px; height: {height+128}px; position:relative;">

    <div style="position:relative; top:60px; left: 10px" >

      {#if selectedModel === MODEL_CUSTOM && customScenarioStatus !== ''}
        <div style="position: absolute; top: 100px; left: 100px; font-size: 40px;">
          {customScenarioStatus}
        </div>
      {/if}

      <Chart bind:active={active}
        states = {P_bars} 
        stateMeta = {stateMeta}
        xmax = {Xmax}
        timestep={timestep}
        tmax={tmax}
        N={N}
        ymax={lock ? Plock: Pmax}
        lastHistoricTime={lastHistoricTime}
        selectedModel={selectedModel}
        icuCapacity={icuCapacity}
        log={!log}
        />
      <div>
        {#if selectedModel === MODEL_GOH}
        <div on:click={addActionMarker}>
          <Icon data={plus}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; top: 20px; cursor: hand;"
            />
        </div>
        {/if}
        <div on:click={toggleZoomStates}>
          <Icon data={search}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; bottom: 0px; cursor: hand;"
            />
        </div>
      </div>
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
      {#each actionMarkers[selectedModel] as actionMarkerData}
        {#if actionMarkerData[AM_DAY] < tmax}
          <ActionMarker
            width = {width}
            height = {height}
            R0 = {R0}
            tmax = {tmax}
            Pmax = {Pmax}
            P_all_historical = {P_all_historical}
            demo_mode = {demo_mode}
            bind:allActiveActionMarkers = {actionMarkers[selectedModel]}
            bind:actionMarkerData = {actionMarkerData}
            bind:Plock = {Plock}
            bind:lock = {lock}
            bind:lock_yaxis = {lock_yaxis}
          />
        {/if}
      {/each}

      <!-- Milestones -->
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

   </div>

</div>


<div style="height:220px;">
  <div class="minorTitle">
    <div style="margin: 0px 0px 5px 4px" class="minorTitleColumn">Parameter configuration for selected scenario/model</div>
  </div>
  <div class = "row">

    {#if selectedModel === MODEL_GOH}

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
        <input class="range" style="margin-bottom: 8px" type=range bind:value={P_SEVERE} min={0} max=1 step=0.0001>      
        <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">Time to hospitalization.<br></div>
        <div class="slidertext">{D_hospital_lag} Days</div>
        <input class="range" type=range bind:value={D_hospital_lag} min={0.5} max=100 step=0.01>
      </div>

      <div class="column">
        <div class="paneltitle">ICU visualization</div>

        <div class="paneldesc" style="height:30px; border-top: 0px solid #EEE;">ICU rate<br></div> 
        <div class="slidertext">{P_ICU}</div>
        <input class="range" style="margin-bottom: 8px" type=range bind:value={P_ICU} min=0 max=1 step=0.01>

        <div class="paneldesc" style="height:29px; border-top: 1px solid #EEE; padding-top: 10px">ICU capacity<br></div> 
        <div class="slidertext">{icuCapacity === 0 ? 'Hidden' : icuCapacity}</div>
        <input class="range" type=range bind:value={icuCapacity} min=0 max=10000 step=10>

      </div>

    {/if}

    {#if selectedModel !== MODEL_GOH}
      <div>
        <p style="white-space: pre-wrap; color: #777; line-height: 17px;">{@html JSON.stringify(selectedParams, null, 4)}</p>
      </div>
    {/if}

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
