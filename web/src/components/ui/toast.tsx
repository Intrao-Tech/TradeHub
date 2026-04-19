import { Toaster as SonnerToaster, toast } from 'sonner'

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

const Toaster = (props: ToasterProps) => {
  return (
    <SonnerToaster
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border group-[.toaster]:border-border-default group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-fg-muted',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
