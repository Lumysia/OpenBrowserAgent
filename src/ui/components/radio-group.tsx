import {
  createContext,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
} from "react";
import { cn } from "../utils";

const RadioContext = createContext({
  name: "",
  value: "",
  onValueChange: (_value: string) => {},
});

export function RadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"div">, "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const name = useId();
  return (
    <RadioContext.Provider value={{ name, value, onValueChange }}>
      <div role="radiogroup" {...props}>
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function RadioGroupItem({
  value,
  className,
  children,
  ...props
}: Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "name" | "checked" | "onChange" | "value"
> & { value: string }) {
  const group = useContext(RadioContext);
  return (
    <label className={cn("ui-radio-item", className)}>
      <input
        {...props}
        type="radio"
        name={group.name}
        value={value}
        checked={group.value === value}
        onChange={() => group.onValueChange(value)}
      />
      {children}
    </label>
  );
}
