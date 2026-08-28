class Utterance < ApplicationRecord
  SNEER_PHOTO_CONTENT_TYPES = %w[image/jpeg image/webp].freeze
  SNEER_PHOTO_MAX_SIZE = 5.megabytes

  belongs_to :room
  belongs_to :user
  has_one_attached :sneer_photo, dependent: :purge_later

  validates :transcript, presence: true
  validates :spoken_at, presence: true
  validates :duration_ms, numericality: { greater_than: 0 }
  validate :acceptable_sneer_photo

  private

  def acceptable_sneer_photo
    return unless sneer_photo.attached?

    unless SNEER_PHOTO_CONTENT_TYPES.include?(sneer_photo.blob.content_type)
      errors.add(:sneer_photo, "はJPEGまたはWebP形式にしてください")
    end

    if sneer_photo.blob.byte_size > SNEER_PHOTO_MAX_SIZE
      errors.add(:sneer_photo, "は5MB以下にしてください")
    end
  end
end
