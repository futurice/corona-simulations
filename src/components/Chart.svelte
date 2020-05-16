<script>
  import { scaleLinear, scaleLog } from 'd3-scale';
  import { drag } from 'd3-drag';
  import { selectAll } from 'd3-selection'
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { formatNumber, padding, MODEL_GOH, formatDate, getDate, addDays, getMonth, getDayFromDate } from '../utils.js';

  const dispatch = createEventDispatcher();

  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  $: showTip = function (i) {
    active_hover = i
  }

  export let states;
  export let stateMeta;
  export let tmax;
  export let xmax;
  export let timestep;
  export let N;
  export let ymax;
  export let log = false;
  export let selectedModel;
  export let icuCapacity;
  export let firstBarDate;

  function shouldWeDrawICUcapacity(selectedModel, stateMeta, ymax) {
    // Note that we need stateMeta and ymax as parameters in order to trigger re-render on certain user actions.
    var icuVisible = false
    var areStatesBelowICUvisible = false
    if (selectedModel !== MODEL_GOH) {
      // Some precomputed models may have been precomputed with a different condition for icu capacity,
      // so it could be misleading if we visualized their results with a different icu capacity indicator.
      return false
    }
    for (var i=0; i<stateMeta.length; i++) {
      const state = stateMeta[i]
      const visible = state["checked"]
      if (state["key"] === "icu" && visible) {
        icuVisible = true
      } else if (icuVisible && visible) {
        // For example, if fatality bars are drawn below ICU bars,
        // it doesn't make sense to show the ICU capacity bar as a straight line.
        return false
      }
    }
    if (!icuVisible) {
      // If ICU has not been checked visible, we don't care about ICU capacity.
      return false
    }
    const pixelsFromBottom = yScale(0) - yScale(icuCapacity)
    if (pixelsFromBottom < 10) {
      // ICU capacity is so close to the x axis (due to y-scale) that it does not make sense to draw it.
      return false
    }
    const pixelsFromTop = yScale(icuCapacity)
    if (pixelsFromTop <= 0) {
      // ICU capacity is at the edge of the chart or beyond it, does not make sense to draw.
      return false
    }
    return true
  }

  function getBarY(state, stateMeta, j) {
    var sumOfHeights = 0
    for (var i=j; i<stateMeta.length; i++) {
      sumOfHeights += getBarHeight(state, stateMeta, i)
    }
    return sumOfHeights
  }

  function getBarHeight(state, stateMeta, j) {
    if (!stateMeta[j]["checked"]) {
      return 0
    }
    const k = stateMeta[j]["key"]
    return state[k]
  }

  let width  = 750;
  let height = 420;

  $: xScale = scaleLinear()
    .domain([0, states.length])
    .range([padding.left, width - padding.right]);

  $: xScaleTime = scaleLinear()
    .domain([0, tmax])
    .range([padding.left, width - padding.right]);

  $: indexToTime = scaleLinear()
    .domain([0, states.length])
    .range([0, tmax])

  $: timeToIndex = scaleLinear()
    .domain([0, tmax])
    .range([0, states.length])

  $: yScale = (log ? scaleLog(): scaleLinear())
    .domain([log ? 1: 0,  ymax/1])
    .range([height - padding.bottom, padding.top]);

  $: yScaleL = scaleLog()
    .domain([1,  ymax/1])
    .range([0, height - padding.bottom - padding.top]);


  $: innerWidth = width - (padding.left + padding.right);
  $: barWidth = innerWidth / states.length - 1.5;
  $: active_hover = -1
  $: lock = false
  var active_lock = 0

  $: active = (function () {
    if (lock){
      var i = Math.round(timeToIndex(active_lock))
      if (i > 99) {
        lock = false
        i = 0
      } else {
        return i
      }
    } else {
      return active_hover
    }
  })()
  export let active;

  // This is used to align the names of months on the axis to be roughly at center of those months.
  // If you tune this, remember to use different zoom settings during testing.
  $: xLabelOffset = Number.parseInt(getDayFromDate(firstBarDate)) - 18

</script>

<style>
  h2 {
    text-align: center;
    font-size: 30px;
    font-weight: 300;
    font-style: normal; 
  }

  .chart {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding-top:30px;
    padding-bottom:10px;
  }

  svg {
    position: relative;
    width: 100%;
    height: 450px;
  }

  .tick {
    font-size: .725em;
    font-weight: 200;
  }

  .tick line {
    stroke: #e2e2e2;
    stroke-dasharray: 2;
  }

  .tick text {
    fill: #aaa;
    text-anchor: start;
  }

  .tick.tick-0 line {
    stroke-dasharray: 0;
  }

  .x-axis .tick text {
    text-anchor: middle;
  }

  .bar {
    stroke: none;
    opacity: 0.65
  }

  .total {
    color: #888;
    font-size: .725em;
    font-weight: 200;
  }


  a.tip span:before{
      content:'';
      display:block;
      width:0;
      height:0;
      position:absolute;

      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
      border-right:8px solid black;
      left:-8px;

      top:7px;
  }

</style>

<div style="width:{width+15}px; height: {height}px; position: relative; top:20px">

  {#if shouldWeDrawICUcapacity(selectedModel, stateMeta, ymax)}
    <div style="position: absolute;
                top: {Math.max(yScale(icuCapacity),0)}px;
                left: 30px;
                width: {width - 30}px;
                height: 1px;
                border-top: 1px solid black;">
    </div>
  {/if}

  <svg style="position:absolute; height: {height}px">

    <!-- y axis -->
    <g class="axis y-axis" transform="translate(0,{padding.top})">
      {#each yScale.ticks(5) as tick}
        <g class="tick tick-{tick}" transform="translate(0, {yScale(tick) - padding.bottom})">
          <line x2="100%"></line>
          <text y="-4">{Number.isInteger(Math.log10(tick)) ? formatNumber(tick) : (log ? "": formatNumber(tick))}{ (tick == yScale.ticks(5)[0]) ? " ": ""}</text>
        </g>
      {/each}
    </g>

    <!-- x axis -->
    <g class="axis x-axis">
      {#each xScaleTime.ticks(100) as i}

        <!-- Show actual date for day 0.
        {#if i == 0}
          <g class="tick" transform="translate({xScaleTime(i)},{height})">
            <text x="0" y="-4">--{getDate(firstBarDate, i)}</text>
          </g>
        -->

        {#if i%30 == 0}
          {#if getDate(firstBarDate, i).endsWith("01.2021")}
            <g class="tick" transform="translate({xScaleTime(i - xLabelOffset)},{height})">
              <text x="0" y="-4">2021</text>
            </g>
          {:else}
            <g class="tick" transform="translate({xScaleTime(i - (i > 0 ? xLabelOffset : 0))},{height})">
              <text x="0" y="-4">{getMonth(addDays(firstBarDate, i))}</text>
            </g>
          {/if}
        {/if}
        
      {/each}
    </g>

    <g class='bars'>
      {#each range(states.length) as i}
        <rect
          on:mouseover={() => showTip(i)}
          on:mouseout={() => showTip(-1)}
          on:click={() => {lock = !lock; active_lock = indexToTime(i) }}
          class="bar"
          x="{xScale(i) + 2}"
          y="{0}"
          width="{barWidth+3}"
          height="{height}"
          style="fill:white; opacity: 0">     
        </rect>

        {#each range(stateMeta.length) as j}
          {#if !log}
            {#if states[i][stateMeta[j]["key"]] > 0}
              <rect
                on:mouseover={() => showTip(i)}
                on:mouseout={() => showTip(-1)}
                on:click={() => {lock = !lock; active_lock = indexToTime(i) }}
                class="bar"
                x="{xScale(i) + 2}"
                y="{yScale(getBarY(states[i], stateMeta, j))}"
                width="{barWidth}"
                height="{Math.max(height - padding.bottom - yScale(getBarHeight(states[i], stateMeta, j)), 0)}" 
                style="fill:{stateMeta[j]['color']}; opacity:{active == i ? 0.9: 0.6}">     
              </rect>
            {/if}
          {/if}
        {/each}

      {/each}
    </g>

  </svg> 

  <div style="position: absolute;width:{width+15}px; height: {height}px; position: absolute; top:0px; left:0px; pointer-events: none">
    
    <!-- Pointer to active bar. -->
    {#if active >= 0}
      <div style="position:absolute; 
                  pointer-events: none;
                  width:100px;
                  left:{xScale(active)}px;
                  top:{Math.max(yScale(getBarY(states[active], stateMeta, 0)),0) }px" class="tip"> 
          <svg style="position:absolute; top:-12px; left:0px" height="10" width="10">
          <path 
            d="M 0 0 L 10 0 L 5 10 z"
            fill="{lock ? '#555':'#AAA'}" 
            stroke-width="3" />
          </svg>
      </div>
    {/if}

  </div>

</div>
