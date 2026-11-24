/** Hesap Merkezi — kimlik ve sahiplik kuralları (saf fonksiyonlar, Firestore yok). */
import { describe, expect, it } from 'vitest'
import {
  checkReplyText,
  conversationToItem,
  countItems,
  DEFAULT_ACCOUNT_CENTER_SETTINGS,
  isManagedUid,
  isValidUid,
  itemInTab,
  normalizeUsernameQuery,
  notificationToItem,
  parseAccountCenterSettings,
  withAutoFooter,
  withMention,
  AUTO_REPLY_FOOTER,
} from './model'

const acc = { uid: 'AbC123uidXYZ0000000000001', username: 'bursa.nahaber' }

describe('UID eşleşmesi birebir', () => {
  it('yalnız tam aynı string yönetilen sayılır', () => {
    const managed = new Set([acc.uid])
    expect(isManagedUid(acc.uid, managed)).toBe(true)
    expect(isManagedUid(acc.uid.toLowerCase(), managed)).toBe(false)
    expect(isManagedUid(` ${acc.uid}`, managed)).toBe(false)
    expect(isManagedUid(acc.uid.slice(0, -1), managed)).toBe(false)
    expect(isManagedUid(`${acc.uid}1`, [acc.uid])).toBe(false)
  })
  it('geçersiz UID biçimleri reddedilir', () => {
    expect(isValidUid('')).toBe(false)
    expect(isValidUid('a/b')).toBe(false)
    expect(isValidUid('a b')).toBe(false)
    expect(isValidUid(42)).toBe(false)
    expect(isValidUid('x'.repeat(129))).toBe(false)
  })
  it('kullanıcı adı araması yalnız @ ve büyük harfi temizler', () => {
    expect(normalizeUsernameQuery('  @Bursa.NaHaber ')).toBe('bursa.nahaber')
    expect(normalizeUsernameQuery(null)).toBe('')
  })
})

describe('sahiplik: başka hesabın bildirimi / sohbeti kullanılamaz', () => {
  it('bildirim userId birebir aynı değilse null', () => {
    expect(notificationToItem('n1', { userId: 'other', type: 'comment', text: 'x' }, acc)).toBeNull()
    expect(notificationToItem('n1', { userId: acc.uid.toUpperCase(), type: 'comment', text: 'x' }, acc)).toBeNull()
  })
  it('sohbet katılımcısı değilse null', () => {
    expect(conversationToItem('c1', { participantIds: ['a', 'b'] }, acc)).toBeNull()
  })
  it('okunmamış yorum cevap bekler; cevaplanan beklemez', () => {
    const a = notificationToItem('n1', { userId: acc.uid, type: 'comment', text: 'Eline sağlık', read: false, createdAt: '2026-11-24T06:00:00Z' }, acc)
    expect(a?.needsAnswer).toBe(true)
    expect(a?.category).toBe('thanks')
    const b = notificationToItem('n2', { userId: acc.uid, type: 'comment', text: 'x', read: false, accountCenterRepliedAt: 1 }, acc)
    expect(b?.needsAnswer).toBe(false)
    const like = notificationToItem('n3', { userId: acc.uid, type: 'like', read: false }, acc)
    expect(like?.needsAnswer).toBe(false)
    expect(itemInTab(like!, 'activity')).toBe(true)
  })
  it('son mesaj karşı taraftansa sohbet cevap bekler', () => {
    const c = conversationToItem('c1', { participantIds: [acc.uid, 'u2'], participants: { u2: { username: 'okur' } }, lastMessageSenderId: 'u2', lastMessageText: 'Merhaba', unreadCount: { [acc.uid]: 2 } }, acc)
    expect(c?.needsAnswer).toBe(true)
    expect(c?.actorUid).toBe('u2')
    expect(c?.actorUsername).toBe('okur')
    const mine = conversationToItem('c1', { participantIds: [acc.uid, 'u2'], lastMessageSenderId: acc.uid, lastMessageText: 'ok' }, acc)
    expect(mine?.needsAnswer).toBe(false)
    expect(countItems([c!, mine!])).toEqual({ pendingComments: 0, unreadMessages: 1, activity: 0 })
  })
})

describe('cevap metni', () => {
  it('boş ve başka site linki reddedilir, nahaber linki geçer', () => {
    expect(checkReplyText('   ')).toEqual({ ok: false, code: 'empty' })
    expect(checkReplyText('bakın https://baska.example/x')).toEqual({ ok: false, code: 'foreign_link' })
    expect(checkReplyText('Haber: https://www.nahaber.com/haber/x')).toMatchObject({ ok: true })
  })
  it('yorum cevabı yorumcuyu bir kez etiketler', () => {
    expect(withMention('Teşekkürler', 'okur_1')).toBe('@okur_1 Teşekkürler')
    expect(withMention('@okur_1 Teşekkürler', 'okur_1')).toBe('@okur_1 Teşekkürler')
    expect(withMention('Teşekkürler', null)).toBe('Teşekkürler')
    expect(withMention('Teşekkürler', 'kötü isim<script>')).toBe('Teşekkürler')
  })
  it('otomatik cevap görünür biçimde etiketlenir', () => {
    expect(withAutoFooter('İlginiz için teşekkür ederiz.')).toContain(AUTO_REPLY_FOOTER)
  })
})

describe('asistan ayarları', () => {
  it('varsayılan her şey kapalı', () => {
    expect(DEFAULT_ACCOUNT_CENTER_SETTINGS.commentMode).toBe('off')
    expect(DEFAULT_ACCOUNT_CENTER_SETTINGS.dmMode).toBe('off')
  })
  it('güvensiz türler otomatik listesine eklenemez', () => {
    const s = parseAccountCenterSettings({ commentMode: 'auto', autoCategories: ['thanks', 'legal', 'complaint', 'abuse'] })
    expect(s.autoCategories).toEqual(['thanks'])
    expect(s.commentMode).toBe('auto')
  })
})
