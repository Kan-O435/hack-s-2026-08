class CreateRoomParticipants < ActiveRecord::Migration[8.1]
  def change
    create_table :room_participants do |t|
      t.references :room, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.datetime :joined_at, null: false
      t.datetime :left_at

      t.timestamps
    end

    add_index :room_participants, [ :room_id, :user_id ], unique: true
  end
end
