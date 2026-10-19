import * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Nota sobre el foco: el anillo va `ring-inset`, dibujado POR DENTRO del campo.
 * Con el `ring-offset-2` de shadcn se pintaba 4px por fuera, y dentro de un
 * modal (`DialogContent` monta un `overflow-y-auto`) ese trozo se recortaba: el
 * recuadro negro del campo enfocado salía cortado contra el borde blanco.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
