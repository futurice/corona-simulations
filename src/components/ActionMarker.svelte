<script>

    import { onMount, onDestroy } from 'svelte';

    import { scaleLinear } from 'd3-scale';
    import { format } from 'd3-format';
    import { drag } from 'd3-drag';
    import { selectAll } from 'd3-selection';
    import Icon from 'svelte-awesome';
    import { gear, trash } from 'svelte-awesome/icons';

    import { math_inline, math_display, formatDelta, padding, getDate } from '../utils.js';
    import { AM_NAME, AM_DAY, AM_EFFECT, AM_EXPANDED, ActionMarkerData } from '../action_marker_data.js';

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
    export let flashMessage;
    export let firstBarDate;

    function toggleConfig() {
        actionMarkerData[AM_EXPANDED] = !actionMarkerData[AM_EXPANDED]
    }

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

    function getLeftPx(actionMarkerData, P_all_historical, tmax) {
        // Note: tmax must be in parameters to trigger re-render correctly.
        return xScaleTime(actionMarkerData[AM_DAY])
    }

    function getZIndex(actionMarkerData) {
        // Action markers on the right should go on top of markers on the left
        var z = actionMarkerData[AM_DAY] * 1000
        // If configuration is expanded, bring towards front.
        if (actionMarkerData[AM_EXPANDED]) {
            z += 1000000
        }
        // If actionmarker is being dragged, bring as front as possible.
        if (actionMarkerData['dragging']) {
            z += 10000000
        }
        return z
    }

    $: zIndex = getZIndex(actionMarkerData)
    $: displayDay = actionMarkerData[AM_DAY]
    $: displayDate = getDate(firstBarDate, displayDay)
    $: adjustedR0 = getAdjustedR0(R0, allActiveActionMarkers, actionMarkerData)
    $: InterventionAmt = 1 - actionMarkerData[AM_EFFECT]
    $: xScaleTime = scaleLinear()
                        .domain([0, tmax])
                        .range([padding.left, width - padding.right]);
    $: xScaleTimeInv = scaleLinear()
                        .domain([0, width])
                        .range([0, tmax]);
    $: leftPx = getLeftPx(actionMarkerData, P_all_historical, tmax)

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
            if (actionMarkerData.isConfigurable()) {
                const draggedX = InterventionTimeStart + xScaleTimeInv(event.x - dragstarty)
                const minX = P_all_historical.length
                const maxX = tmax-1
                if (draggedX < minX-3) {
                    flashMessage = 'Action markers affect model predictions, not historical estimates.'
                } else {
                    flashMessage = ''
                }
                actionMarkerData[AM_DAY] = Math.round(Math.min(maxX, Math.max(minX, draggedX)))
                actionMarkerData['dragging'] = true
            }
        }

        var dragend = function (d) {
            lock = false
            actionMarkerData['dragging'] = false
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
        font-size: 13px;    
    }

    /* TODO move copypasted CSS to global.css */

    .legendtext{
        color:#888; 
        font-size:13px;
        padding-bottom: 5px;
        font-weight: 300;
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
        font-family: 'Source Code Pro', monospace;
        font-size: 10px;
        text-align: right;
        /*font-weight: bold*/
    }
        
    .range {
        width: 100%;
    }

</style>

<div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:100px; left:10px; pointer-events: none; z-index: {zIndex};" title={actionMarkerData[AM_NAME]}>

    <!-- Drag (clicking anywhere on this div will trigger drag, no other events) -->
    <div id={actionMarkerData.id} style="pointer-events: all;
                                position: absolute;
                                top:-38px;
                                left:{leftPx - 1}px;
                                width:2px;
                                background-color:#FFF;
                                border-right: 1px dashed black;
                                pointer-events: all;
                                cursor:{actionMarkerData.isConfigurable() ? 'col-resize' : 'not-allowed'};
                                height:{height+19}px;">

        <div style="flex: 0 0 160px;
                    min-width:220px;
                    position:relative;
                    top:-67px;
                    height: 74px;
                    left: 0px;
                    cursor:{actionMarkerData.isConfigurable() ? 'col-resize' : 'not-allowed'};
                    background-color: white;
                    position:absolute">

            {#if actionMarkerData.isConfigurable()}
                <div style="top:-23px; left:-7px; position: absolute; text-align: right; width: 20px; height:20px; opacity: 0.3">
                    <svg width="20" height="20">
                        <g transform="rotate(90)">
                            <g transform="translate(0,-20)">
                            <path d="M2 11h16v2H2zm0-4h16v2H2zm8 11l3-3H7l3 3zm0-16L7 5h6l-3-3z"/>
                            </g>  
                        </g>
                    </svg>
                </div>
            {/if}

            <div class="caption" style="pointer-events: none; position: absolute; left:1px; top:0px; height: 60px; min-width:220px; border-left: 3px solid #777; padding: 5px 7px 7px 7px; ">      
                <div class="paneltext" style="height:20px; text-align: right">

                    <div class="paneltitle unselectable" style="top:0px; position: relative; text-align: left; white-space: nowrap;">
                        {actionMarkerData[AM_NAME]} on {displayDate}
                    </div>

                    {#if actionMarkerData.isConfigurable()}
                        <div class="paneldesc unselectable">
                            <span style="color: {InterventionAmt < 1 ? '#4daf4a' : '#f0027f'}">
                                {formatDelta(-100*(1-InterventionAmt))}%
                            </span>
                            transmission
                            <span style="font-size: 11px;">
                                ({@html math_inline("\\mathcal{R}_0=" + adjustedR0.toFixed(2) )})
                            </span>
                        </div>
                    {/if}
                    
                </div>
                
            </div>
        </div>
    </div>

    
</div>

<!-- Interactive controls placed below. Note that we must keep them outside the parent div of the drag div! -->
{#if actionMarkerData.isConfigurable()}
    <div style="position: absolute; width:{width+15}px; height: {height}px; position: absolute; top:140px; left:20px; pointer-events: none; z-index: {zIndex+1};">

        <div style="pointer-events: all; position: absolute; left:{leftPx - 1}px; top: -105px; padding-top: 7px; width: 150px;">

            <div class="caption paneldesc unselectable" style="margin-top: 0px; height: 20px; font-style: italic;" on:click={toggleConfig}>
                <Icon data={gear}
                    scale=1.0
                    class="clickableIcons"
                    style="color: #CCC; position: absolute;"
                />
                <span style="position: absolute; left: 20px;">{actionMarkerData[AM_EXPANDED] ? "Hide config" : "Configure"}</span>
            </div>

            {#if actionMarkerData[AM_EXPANDED]}
                <div on:click={() => {actionMarkerData[AM_DAY] = 1337}}>
                    <Icon data={trash}
                        scale=1.0
                        class="clickableIcons"
                        style="color: #CCC; position: absolute; right: 0px;"
                    />
                </div>
                <div style="background-color: #FFF;">
                    <div class="caption paneldesc unselectable" style="margin-top: 6px;">Name</div>
                    <input bind:value={actionMarkerData[AM_NAME]} style="width: 99%;">
                    <input class="range" style="width: 100%;" type=range bind:value={actionMarkerData[AM_EFFECT]} min=-2 max=1 step=0.01 on:mousedown={lock_yaxis}>
                    <div class="caption paneldesc unselectable" style="margin-top: -10px; text-align:left;">
                        {@html math_inline("←")} Bad
                        <span style="float:right;">
                        Good {@html math_inline("→")}
                        </span>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

    