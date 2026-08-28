class RoomResult < ApplicationRecord
  belongs_to :room
  belongs_to :user

  # Active Storage(storage/配下)に保存する。sneer_photoと同じ永続ボリュームでそのまま守られる
  has_one_attached :voice_roast_audio, dependent: :purge_later

  enum :voice_roast_status, {
    unavailable: "unavailable",
    processing: "processing",
    ready: "ready",
    failed: "failed"
  }, default: "unavailable"
end
