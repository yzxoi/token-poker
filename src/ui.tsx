import type { Component } from "solid-js"
import type { PluginSurfaceContext } from "@ericsanchezok/synergy-plugin/ui"

const PluginSurface: Component<{ context: PluginSurfaceContext }> = (props) => (
  <section aria-label={props.context.surface.id}>Plugin content</section>
)

export default PluginSurface
