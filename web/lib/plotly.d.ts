declare module "plotly.js-basic-dist-min" {
    export interface PlotlyStatic {
        newPlot(
            el: HTMLElement,
            data: unknown[],
            layout: Record<string, unknown>,
            config?: Record<string, unknown>,
        ): Promise<unknown>;
        react(
            el: HTMLElement,
            data: unknown[],
            layout: Record<string, unknown>,
            config?: Record<string, unknown>,
        ): Promise<unknown>;
    }
    const Plotly: PlotlyStatic;
    export default Plotly;
}
