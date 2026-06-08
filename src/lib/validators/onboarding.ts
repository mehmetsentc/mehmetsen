import { z } from 'zod'

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Ad en az 2 karakter olmalı')
    .max(50, 'Ad en fazla 50 karakter olabilir'),
  username: z
    .string()
    .min(3, 'Kullanıcı adı en az 3 karakter olmalı')
    .max(30, 'Kullanıcı adı en fazla 30 karakter olabilir')
    .regex(/^[a-z0-9_]+$/, 'Sadece küçük harf, rakam ve alt çizgi kullanılabilir'),
  bio: z
    .string()
    .max(160, 'Biyografi en fazla 160 karakter olabilir')
    .optional()
    .or(z.literal('')),
  location: z
    .string()
    .max(60, 'Konum en fazla 60 karakter olabilir')
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .max(100, 'Adres en fazla 100 karakter olabilir')
    .optional()
    .or(z.literal('')),
})

export type OnboardingFormData = z.infer<typeof onboardingSchema>
