import { useEffect } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Option } from "@/types";

export interface QuickField {
  name: string;
  label: string;
  type?: "text" | "number" | "email" | "tel" | "select" | "multiselect";
  options?: Option[];
  placeholder?: string;
  full?: boolean;
  hint?: string;
}

/**
 * Small "Add" dialog for master records, driven by a zod schema and a field list.
 * The parsed (typed) values are passed to onSubmit.
 */
export function QuickAddDialog<S extends z.ZodTypeAny>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaults,
  fields,
  onSubmit,
  submitLabel = "Save",
  note,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  schema: S;
  defaults: z.input<S> & FieldValues;
  fields: QuickField[];
  onSubmit: (values: z.output<S>) => Promise<unknown>;
  submitLabel?: string;
  note?: React.ReactNode;
}) {
  const form = useForm<FieldValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  useEffect(() => {
    if (open) form.reset(defaults);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (values: FieldValues) => {
    await onSubmit(schema.parse(values) as z.output<S>);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form
            id="quick-add"
            onSubmit={form.handleSubmit(submit)}
            className="grid gap-4 sm:grid-cols-2"
            noValidate
          >
            {fields.map((f) => (
              <FormField
                key={f.name}
                control={form.control}
                name={f.name}
                render={({ field }) => (
                  <FormItem className={cn(f.full && "sm:col-span-2")}>
                    <FormLabel>{f.label}</FormLabel>
                    {f.type === "select" ? (
                      <Select value={String(field.value ?? "")} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={f.placeholder ?? "Choose"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {f.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.type === "multiselect" ? (
                      <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                        {f.options?.map((o) => {
                          const list = (field.value as string[] | undefined) ?? [];
                          return (
                            <label key={o.value} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={list.includes(o.value)}
                                onCheckedChange={(c) =>
                                  field.onChange(
                                    c ? [...list, o.value] : list.filter((x) => x !== o.value),
                                  )
                                }
                              />
                              {o.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : f.type === "number" ? (
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder={f.placeholder}
                          value={Number.isFinite(field.value) ? (field.value as number) : ""}
                          onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        />
                      </FormControl>
                    ) : (
                      <FormControl>
                        <Input
                          type={f.type ?? "text"}
                          placeholder={f.placeholder}
                          {...field}
                          value={String(field.value ?? "")}
                        />
                      </FormControl>
                    )}
                    {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </form>
        </Form>
        {note}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="quick-add" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
