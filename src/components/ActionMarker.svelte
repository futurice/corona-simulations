<script>

    import { onMount, onDestroy } from 'svelte';

    import { scaleLinear } from 'd3-scale';
    import { format } from 'd3-format';
    import { drag } from 'd3-drag';
    import { selectAll } from 'd3-selection';

    import { math_inline, math_display, formatDelta, padding, SHOW_FUTURE } from '../utils.js';
    import { AM_NAME, AM_DAY, AM_EFFECT, ActionMarkerData } from '../action_marker_data.js';

    export let width;
    export let height;
    export let R0;
    export let Pmax;
    export let tmax;

    export let allActiveActionMarkers; // We need these to calculate cumulative effect to R0
    export let actionMarkerData; // The data for this action marker
    export let Plock;
    export let lock;
    export let lock_yaxis;
    export let P_all_historical;
    export let demo_mode;

    function getAdjustedR0(R0, allActiveActionMarkers, actionMarkerData) {
        var adjustedR0 = R0
        const upToIncludingDay = actionMarkerData[AM_DAY]
        for (var i=0; i<allActiveActionMarkers.length; i++) {
            const am = allActiveActionMarkers[i]
            const day = am[AM_DAY]
            if (day <= upToIncludingDay) {
                adjustedR0 *= (1 - am[AM_EFFECT])
            }
        }
        return adjustedR0
    }

    function getLeftPx(actionMarkerData, demo_mode, P_all_historical, tmax) {
        // Note: tmax must be in parameters to trigger re-render correctly.
        const adjustedDays = actionMarkerData[AM_DAY] - (demo_mode === SHOW_FUTURE ? P_all_historical.length-1 : 0)
        return xScaleTime(adjustedDays)
    }

    $: displayDay = actionMarkerData[AM_DAY] - (demo_mode === SHOW_FUTURE ? P_all_historical.length-1 : 0)
    $: adjustedR0 = getAdjustedR0(R0, allActiveActionMarkers, actionMarkerData)
    $: InterventionAmt = 1 - actionMarkerData[AM_EFFECT]
    $: xScaleTime = scaleLinear()
                        .domain([0, tmax])
                        .range([padding.left, width - padding.right]);
    $: xScaleTimeInv = scaleLinear()
                        .domain([0, width])
                        .range([0, tmax]);
    $: leftPx = getLeftPx(actionMarkerData, demo_mode, P_all_historical, tmax)

    var drag_intervention = function (){
        var dragstarty = 0
        var InterventionTimeStart = 0

        var dragstarted = function (d) {
            dragstarty = event.x  
            InterventionTimeStart = actionMarkerData[AM_DAY]
            Plock = Pmax
            lock = true
        }

        var dragged = function (d) {
            const draggedX = InterventionTimeStart + xScaleTimeInv(event.x - dragstarty)
            const minX = P_all_historical.length
            const maxX = tmax-1 + (demo_mode === SHOW_FUTURE ? P_all_historical.length-1 : 0)
            actionMarkerData[AM_DAY] = Math.round(Math.min(maxX, Math.max(minX, draggedX)))
        }

        var dragend = function (d) {
            lock = false
        }

        return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
    }

    onMount(async () => {
        var drag_callback_intervention = drag_intervention()
        drag_callback_intervention(selectAll(`#${actionMarkerData.id}`))
    });

    onDestroy(async () => {
        //console.log('destroyed')
    })

</script>

<style>

    .caption {
        font-family: nyt-franklin,helvetica,arial,sans-serif;
        font-size: 13px;    
    }

    /* TODO move copypasted CSS to global.css */

    .legendtext{
        color:#888; 
        font-size:13px;
        padding-bottom: 5px;
        font-weight: 300;
        font-family: nyt-franklin,helvetica,arial,sans-serif;
        line-height: 14px;
    }

    :global(.unselectable){
        -webkit-user-select: none; /* Safari */        
        -moz-user-select: none; /* Firefox */
        -ms-user-select: none; /* IE10+/Edge */
        user-select: none; /* Standard */
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
        padding-left: 1px;
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

</style>

<div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:100px; left:10px; pointer-events: none">

    <!-- Drag (clicking anywhere on this div will trigger drag, no other events) -->
    <div id={actionMarkerData.id} style="pointer-events: all;
                                position: absolute;
                                top:-38px;
                                left:{leftPx - 1}px;
                                width:2px;
                                background-color:#FFF;
                                border-right: 1px dashed black;
                                pointer-events: all;
                                cursor:col-resize;
                                height:{height+19}px;">

        <div style="flex: 0 0 160px; min-width:200px; max-width: 200px; position:relative; top:-67px; height: 74px; left: 0px; ;cursor:col-resize; background-color: white; position:absolute" >
            <div class="caption" style="pointer-events: none; position: absolute; left:1px; top:0px; height: 60px; min-width:200px; border-left: 3px solid #777; padding: 5px 7px 7px 7px; ">      
                <div class="paneltext" style="height:20px; text-align: right">
                    <div class="paneltitle unselectable" style="top:0px; position: relative; text-align: left">
                        {actionMarkerData[AM_NAME]} on day {displayDay}
                    </div>
                    <div class="paneldesc unselectable">
                        <span style="color: {InterventionAmt < 1 ? '#4daf4a' : '#f0027f'}">
                            {formatDelta(-100*(1-InterventionAmt))}%
                        </span>
                        transmission
                        <span style="font-size: 11px;">
                             ({@html math_inline("\\mathcal{R}_0=" + adjustedR0.toFixed(2) )})
                        </span>
                    </div>
                    
                </div>
                
            </div>
        </div>
    </div>

    <!-- Interactive controls placed here, outside the drag div. -->
    <div style="pointer-events: all; position: absolute; left:{leftPx - 1}px; top: -65px; padding: 5px 7px 7px 7px; width: 150px;">
        <input class="range" type=range bind:value={actionMarkerData[AM_EFFECT]} min=-1 max=1 step=0.01 on:mousedown={lock_yaxis}>
    </div>
</div>

    