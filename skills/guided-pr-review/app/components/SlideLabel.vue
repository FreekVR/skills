<template>
  <!-- The label of an icon pill: hidden until the pill (a `group`) has hover or keyboard focus, then it slides out.
       A screen reader reads the pill's aria-label instead. -->
  <span class="inline-block max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-300 ease-review group-hover:max-w-[40ch] group-hover:opacity-100 group-focus-visible:max-w-[40ch] group-focus-visible:opacity-100 motion-reduce:transition-none" aria-hidden="true"><slot /></span>
</template>
