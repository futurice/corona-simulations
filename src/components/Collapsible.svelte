<script>

    import { fade, fly } from 'svelte/transition';
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

<p class="center" style="cursor: pointer;" on:click={toggleCollapse} title="{hidden ? 'Click to expand' : 'Click to collapse'}">
    <Icon data={hidden ? caretRight : caretDown}
        scale=1.5
        class="clickableIcons"
        style="color: #CCC; position: absolute;"
    />
    <b style="margin-left: 20px;">{title}</b>
</p>

{#if !hidden}
    <div in:fly="{{ y: 200, duration: 500 }}">
        <slot>
        </slot>
    </div>
{/if}