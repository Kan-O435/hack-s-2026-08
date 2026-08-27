class User < ApplicationRecord
  before_validation :assign_device_token, on: :create

  has_many :room_participants, dependent: :destroy
  has_many :rooms, through: :room_participants
  has_many :hosted_rooms, class_name: "Room", foreign_key: :host_user_id, inverse_of: :host_user, dependent: :destroy

  validates :nickname, presence: true, length: { maximum: 30 }
  validates :device_token, presence: true, uniqueness: true

  private

  def assign_device_token
    self.device_token ||= SecureRandom.hex(32)
  end
end
