/**
 * PaymentProvider interface — P10A.
 * Architecture: future providers MUST use hosted/tokenized checkout.
 * NaHaber never accepts or stores raw card PAN/CVV.
 */
import type { PaymentProviderKind } from '@/types/commercialLedger'
import { CARD_DATA_POLICY } from '@/types/commercialLedger'
import { assertTestPaymentProviderAllowed } from '@/lib/commercial/commercialFlags'

export interface CreatePaymentInput {
  paymentIntentId: string
  amountMinor: number
  currency: string
  metadata?: Record<string, unknown>
}

export interface CreatePaymentResult {
  provider: PaymentProviderKind
  providerReference: string
  providerTransactionId: string
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
}

export interface VerifyPaymentInput {
  providerReference: string
  providerTransactionId?: string
}

export interface RefundPaymentInput {
  providerReference: string
  amountMinor: number
  currency: string
  idempotencyKey: string
}

export interface RefundPaymentResult {
  providerTransactionId: string
  status: 'SUCCEEDED' | 'FAILED'
  amountMinor: number
}

export interface PaymentProvider {
  readonly kind: PaymentProviderKind
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  verifyPayment(input: VerifyPaymentInput): Promise<{ ok: boolean; status: string }>
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>
}

/** Test-only provider. Production hard-reject via assertTestPaymentProviderAllowed. */
export class TestPaymentProvider implements PaymentProvider {
  readonly kind = 'TEST' as const
  private readonly captures = new Map<string, CreatePaymentResult>()
  private failNext = false

  constructor() {
    assertTestPaymentProviderAllowed()
  }

  /** Test hook — next createPayment fails. */
  setFailNext(v: boolean): void {
    this.failNext = v
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    assertTestPaymentProviderAllowed()
    if (this.failNext) {
      this.failNext = false
      return {
        provider: 'TEST',
        providerReference: `test_ref_${input.paymentIntentId}`,
        providerTransactionId: `test_txn_fail_${input.paymentIntentId}`,
        status: 'FAILED',
      }
    }
    const result: CreatePaymentResult = {
      provider: 'TEST',
      providerReference: `test_ref_${input.paymentIntentId}`,
      providerTransactionId: `test_txn_${input.paymentIntentId}`,
      status: 'SUCCEEDED',
    }
    this.captures.set(result.providerReference, result)
    return result
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<{ ok: boolean; status: string }> {
    assertTestPaymentProviderAllowed()
    const hit = this.captures.get(input.providerReference)
    if (!hit) return { ok: false, status: 'NOT_FOUND' }
    return { ok: hit.status === 'SUCCEEDED', status: hit.status }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    assertTestPaymentProviderAllowed()
    return {
      providerTransactionId: `test_refund_${input.idempotencyKey}`,
      status: 'SUCCEEDED',
      amountMinor: input.amountMinor,
    }
  }
}

export function getPaymentProvider(kind: PaymentProviderKind): PaymentProvider {
  if (kind === 'TEST') return new TestPaymentProvider()
  throw new Error(`Payment provider ${kind} not available in P10A (${CARD_DATA_POLICY})`)
}
