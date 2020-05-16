<script>

    import Icon from 'svelte-awesome';
    import { caretDown, caretRight } from 'svelte-awesome/icons';

    export let title;
    export let collapsed;
    export let defaultCollapsed;

    $: hidden = collapsed.hasOwnProperty(title) ? collapsed[title] : defaultCollapsed

    function toggleCollapse() {
        collapsed[title] = !hidden
    }

</script>

<style>

    div, div :global(div), div :global(ul) {
        margin: auto;
        width: 950px;
        padding-bottom: 20px;
        font-weight: 300;
        color:#666;
        font-size: 16.5px;
        text-align: justify;
        line-height: 24px
    }
    
    div :global(ul) {
        width: 930px !important;
        padding-left: 20px !important;
    }

</style>

<div style="cursor: pointer;" on:click={toggleCollapse} title="{hidden ? 'Click to expand' : 'Click to collapse'}">
    <Icon data={hidden ? caretRight : caretDown}
        scale=1.5
        class="clickableIcons"
        style="color: #CCC; position: absolute;"
    />
    <b style="margin-left: 20px;">{title}</b>
</div>

{#if !hidden}
    <div style="padding-bottom: 0 !important;">
        <slot>
        </slot>
    </div>
{/if}