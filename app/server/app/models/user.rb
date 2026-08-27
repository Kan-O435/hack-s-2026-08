class User < ApplicationRecord
  before_validation :assign_device_token, on: :create

  validates :nickname, presence: true, length: { maximum: 30 }
  validates :device_token, presence: true, uniqueness: true

  private

  def assign_device_token
    self.device_token ||= SecureRandom.hex(32)
  end
end
