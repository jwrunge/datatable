<script lang="ts">
    import {onMount, createEventDispatcher} from "svelte"
    import {fade, scale} from "svelte/transition"

    const dispatch = createEventDispatcher()
    export let mouseX = 0
    export let mouseY = 0
    export let col: string | number = ""
    export let row: any = {}

    interface contextButtons {
        name: string,
        func: Function
    }

    export let context: "row" | "column" = "column"
    export let rowContextButtons: contextButtons[] = []

    let pos: {x: number, y: number} = {
        x: 0,
        y: 0
    }

    function placeBox(pos: {x: number, y: number}) {
        return `top: ${pos.y}px; left: ${pos.x}px;`
    }

    onMount(()=> {
        pos.x = mouseX
        pos.y = mouseY
    })
</script>

<div transition:fade={{duration: 200}} class="context-background" on:click={()=> dispatch("close")} on:keypress></div>
<div transition:scale={{duration: 200}} class="context-menu" style={placeBox(pos)}>
    {#if context === "column"}
        <!-- <div class="context-title">Column Options</div> -->
        <a href="addColumn" on:click|preventDefault={()=> {dispatch("add"); dispatch("close")}}>Columns</a>
        <a href="closeColumn" on:click|preventDefault={()=> {dispatch("close_column", col); dispatch("close")}}>Close</a>
    {:else if context === "row" && rowContextButtons.length}
        {#each rowContextButtons as btn}
            <a href="button-{btn.name}" on:click|preventDefault={()=> { btn.func(row, col); dispatch("close") }}>{btn.name}</a>
        {/each}
    {/if}
</div>

<style lang="scss">
    .context-background {
        background: rgba(0,0,0,.5);
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 5;
    }

    .context-menu {
        position: fixed;
        z-index: 5;
        transform: translateX(-50%) translateY(1rem);
    }
</style>