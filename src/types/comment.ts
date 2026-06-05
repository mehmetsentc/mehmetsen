// TODO: Implement in Phase 1
export interface Comment {
  id: string
  postId: string
  parentId: string | null
  authorId: string
  authorUsername: string
  authorPhotoURL: string | null
  content: string
  likesCount: number
  repliesCount: number
  isEdited: boolean
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}
