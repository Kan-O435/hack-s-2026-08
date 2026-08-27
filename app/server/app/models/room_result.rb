class RoomResult < ApplicationRecord
  belongs_to :room
  belongs_to :user

  enum :voice_roast_status, {
    unavailable: "unavailable",
    processing: "processing",
    ready: "ready",
    failed: "failed"
  }, default: "unavailable"

  def voice_roast_path
    Rails.root.join("tmp", "voice_roasts", "#{id}.mp3")
  end
end
