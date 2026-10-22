/* global AdaptiveCards */
export class CardAdapter {
  constructor(element, execute, changed) {
    this.element = element;
    this.execute = execute;
    element.addEventListener("input", changed);
    element.addEventListener("change", changed);
    AdaptiveCards.AdaptiveCard.onProcessMarkdown = (text, result) => {
      result.outputHtml = text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]).replace(/\n/g, "<br>");
      result.didProcess = true;
    };
  }
  render(expanded, draft, contracts) {
    const card = new AdaptiveCards.AdaptiveCard();
    const style = getComputedStyle(document.documentElement);
    const color = (token, fallback) => style.getPropertyValue(token).trim() || fallback;
    card.hostConfig = new AdaptiveCards.HostConfig({
      supportsInteractivity: true,
      fontFamily: style.getPropertyValue("--font-sans").trim() || "Segoe UI, sans-serif",
      containerStyles: {
        default: { backgroundColor: color("--background-color-default", "#ffffff"),
          foregroundColors: { default: { default: color("--text-color-default", "#1f2328"), subtle: color("--text-color-muted", "#59636e") } } }
      },
      actions: { maxActions: 10, actionsOrientation: "vertical" }
    });
    const diagnostics = new AdaptiveCards.SerializationContext();
    card.parse(expanded, diagnostics);
    const validation = card.validateProperties();
    if (diagnostics.eventCount || validation.validationEvents.length) {
      const messages = [];
      for (let i = 0; i < diagnostics.eventCount; i++) messages.push(diagnostics.getEventAt(i).message);
      for (const event of validation.validationEvents) messages.push(event.message);
      throw new Error(`Renderer diagnostics: ${messages.join("; ")}`);
    }
    for (const input of card.getAllInputs()) {
      if (Object.hasOwn(draft, input.id)) {
        const value = draft[input.id];
        if (input.getJsonTypeName() === "Input.Number") input.defaultValue = value === "" || value === null ? undefined : Number(value);
        else if (input.getJsonTypeName() === "Input.Toggle" && typeof value === "boolean") input.defaultValue = value ? input.valueOn : input.valueOff;
        else input.defaultValue = value === null ? undefined : String(value);
      }
    }
    card.onExecuteAction = action => {
      if (["Action.ShowCard", "Action.ToggleVisibility"].includes(action.getJsonTypeName())) return;
      const contract = contracts[action.id];
      if (!contract) throw new Error("This action has no declared submission contract.");
      const values = this.values();
      const inputs = Object.fromEntries(Object.keys(contract.properties).filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
      void this.execute(action.id, inputs);
    };
    const rendered = card.render();
    if (!rendered) throw new Error("The renderer did not produce a card.");
    this.card = card;
    this.element.replaceChildren(rendered);
  }
  values() {
    return Object.fromEntries((this.card?.getAllInputs() ?? []).map(input => [input.id, input.value ?? ""]));
  }
}
