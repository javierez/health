"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "./button";
import { Input, type InputProps } from "./input";

/** A password field with the eye that shows it, as on Vesta's sign-in. */
export function PasswordInput({ className, ...props }: Omit<InputProps, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-0 top-0 h-full px-3"
        onClick={() => setShow((s) => !s)}
        disabled={props.disabled}
        aria-label={show ? "Ocultar contraseña" : "Ver contraseña"}
      >
        {show ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}
