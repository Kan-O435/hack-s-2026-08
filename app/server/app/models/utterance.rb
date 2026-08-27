class Utterance < ApplicationRecord
  belongs_to :room
  belongs_to :user

  validates :transcript, presence: true
  validates :spoken_at, presence: true
  validates :duration_ms, numericality: { greater_than: 0 }
end
