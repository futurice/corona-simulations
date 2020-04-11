<script>
    import Checkbox from './Checkbox.svelte';
    import Arrow from './Arrow.svelte';
    import { addDays, formatCount, formatPercent, formatDelta } from '../utils.js';

    const legendheight = 67

    export let N;
    export let dt;
    export let stateMeta;
    export let P_all;
    export let P_bars;
    export let active_;
    export let indexToTime;
    export let firstBarDate;

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

    function formatDate(date) {
        const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date)
        const month = new Intl.DateTimeFormat('en', { month: 'numeric' }).format(date)
        const day = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date)
        return `${day}.${month}.${year}`
    }

    function getDate(bar) {
        const days = getDay(bar)
        return formatDate(addDays(firstBarDate, days))
    }

</script>

<style>
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
</style>


<div class="legendtext" style="position:absolute; left:-70px; top:-50px; width:150px; height: 100px; font-size: 13px; line-height:16px; font-weight: normal; text-align: center">
<b>Highlighted day:</b>
<br>Day {getDay(active_)}
<br>{getDate(active_)}
</div>

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
                <div class="legendtextnum"><span style="font-size:12px; padding-right:3px; color:#CCC">∑</span>
                    <i>
                    {formatCount(P_bars[active_][state["key"]])} 
                    ({formatPercent(P_bars[active_][state["key"]] / N)}%)
                    </i>
                </div>
                <div class="legendtextnum"><span style="font-size:12px; padding-right:2px; color:#CCC">Δ</span>
                    <i>
                    {formatDelta(get_count_delta(state["key"], active_))} on day {getDay(active_)}
                    </i>
                </div>
            </div>
        </div>
        <div class="legendtext" style="text-align: right; width:105px; left:-111px; top: 4px; position:relative;">
            {state["tooltip_desc"]}
        </div>
    </div>
{/if}
{/each}
